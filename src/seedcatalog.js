const enc = new TextEncoder();

async function sha256Hex(input) {
  const data = typeof input === "string" ? enc.encode(input) : input;
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256Hex(secret, message) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function canon(obj) {
  if (Array.isArray(obj)) return "[" + obj.map(canon).join(",") + "]";
  if (obj && typeof obj === "object") return "{" + Object.keys(obj).sort().map(k => JSON.stringify(k) + ":" + canon(obj[k])).join(",") + "}";
  return JSON.stringify(obj);
}

const RULESET = {
  schema: "arc.seedcatalog.ruleset.v4",
  version: "0.4.0",
  architecture: "palantir_arc_core_split_bundle_static",
  allowed_category_prefixes: [
    "media/movie",
    "media/show",
    "media/public-domain",
    "media/licensed",
    "media/internal",
    "dataset/media",
    "game/homebrew",
    "asset/internal",
    "catalog/authorized"
  ],
  store_raw_names: false,
  store_raw_urls: false,
  store_server_names: false,
  store_paths: false,
  store_descriptions: false,
  store_media: false,
  store_user_data: false
};

const RAW_FIELD_DENYLIST = [
  "title", "name", "server", "server_id", "host", "hostname", "url", "href",
  "path", "poster", "image", "description", "overview", "stream", "stream_url",
  "watch_url", "embed", "cookie", "token", "authorization", "user", "email"
];

function looksLikeRow(x) {
  return x && typeof x === "object" && !Array.isArray(x) &&
    ("path" in x || "url" in x || "href" in x || "title" in x || "name" in x || "id" in x || "category" in x || "genre" in x);
}

function detectShape(doc) {
  if (Array.isArray(doc)) return "flat_array";
  if (doc && Array.isArray(doc.servers)) return "servers";
  if (doc && Array.isArray(doc.sources)) return "sources";
  if (doc && Array.isArray(doc.data)) return "data";
  if (doc && Array.isArray(doc.items)) return "items";
  if (doc && typeof doc === "object") {
    for (const value of Object.values(doc)) {
      if (Array.isArray(value)) return "object_map";
    }
    if (looksLikeRow(doc)) return "single_object";
  }
  return "unknown";
}

function inferCategory(item, server) {
  const raw = item.category || item.categories || item.genre || item.type || server.category || server.type || "";
  if (Array.isArray(raw)) return String(raw[0] || "catalog/authorized/uncategorized");
  if (!raw) return "catalog/authorized/uncategorized";
  const s = String(raw).trim().replace(/\s+/g, "-").toLowerCase();
  if (s.includes("/")) return s;
  if (["movie", "film"].includes(s)) return "media/movie/authorized";
  if (["show", "series", "tv"].includes(s)) return "media/show/authorized";
  if (s.includes("game")) return "game/homebrew/authorized";
  if (s.includes("asset")) return "asset/internal/authorized";
  if (s.includes("public")) return "media/public-domain/authorized";
  if (s.includes("licensed")) return "media/licensed/authorized";
  return `catalog/authorized/${s}`;
}

function normalizeRows(doc) {
  const rows = [];
  const shape = detectShape(doc);

  const pushRow = (server, item, origin = "unknown") => {
    const category = inferCategory(item, server);
    const volatilePath = item.path || item.url || item.href || item.id || item.slug || item.title || item.name || JSON.stringify(item);
    rows.push({
      server_id: server.server_id || server.server || server.source || server.name || server.host || server.hostname || server.id || origin || "source",
      server_type: server.server_type || server.type || server.source_type || "authorized_catalog",
      region: server.region || server.locale || "unknown",
      legal_basis: server.legal_basis || server.license || "authorized_or_internal",
      capabilities: Array.isArray(server.capabilities) ? server.capabilities : [],
      volatile_path: volatilePath,
      volatile_title: item.title || item.name || "",
      volatile_quality: item.quality || item.resolution || "",
      category,
      origin_shape: origin
    });
  };

  if (Array.isArray(doc)) {
    for (const item of doc) pushRow(item, item, "flat_array");
  } else if (doc && Array.isArray(doc.servers)) {
    for (const server of doc.servers) {
      const items = Array.isArray(server.items) ? server.items : [];
      for (const item of items) pushRow(server, item, "servers");
    }
  } else if (doc && Array.isArray(doc.sources)) {
    for (const server of doc.sources) {
      const items = Array.isArray(server.items) ? server.items : Array.isArray(server.catalog) ? server.catalog : [];
      for (const item of items) pushRow(server, item, "sources");
    }
  } else if (doc && Array.isArray(doc.data)) {
    for (const item of doc.data) pushRow(item, item, "data");
  } else if (doc && Array.isArray(doc.items)) {
    for (const item of doc.items) pushRow(doc, item, "items");
  } else if (doc && typeof doc === "object") {
    for (const [key, value] of Object.entries(doc)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (looksLikeRow(item)) pushRow({ server_id: key, server_type: "object_map" }, item, "object_map");
        }
      }
    }
    if (!rows.length && looksLikeRow(doc)) pushRow(doc, doc, "single_object");
  }

  return { rows, shape };
}

function validCategory(category) {
  return RULESET.allowed_category_prefixes.some(p => String(category).startsWith(p));
}

function safeSourceFingerprint(row) {
  return {
    server_type: row.server_type || "authorized_catalog",
    region: row.region || "unknown",
    legal_basis: row.legal_basis || "authorized_or_internal",
    capabilities: Array.isArray(row.capabilities) ? [...row.capabilities].sort() : []
  };
}

async function rulesetHash() {
  return await sha256Hex(canon(RULESET));
}

async function sourceId(row) {
  return await sha256Hex(canon(safeSourceFingerprint(row)));
}

async function deriveReceipt(row, seed, epoch, rHash) {
  const category = validCategory(row.category) ? row.category : "catalog/authorized/uncategorized";
  const sid = await sourceId(row);
  const volatile = `${row.server_id}|${row.volatile_path}|${row.volatile_title}|${row.volatile_quality}|${epoch}`;
  const entry = await hmacSha256Hex(seed, `${sid}|${volatile}`);
  const cat = await hmacSha256Hex(seed, `${category}|ruleset:${rHash}`);

  const core = {
    schema: "arc.seedcatalog.entry_receipt.v4",
    entry_id: `hmac-sha256:${entry}`,
    source_id: `sha256:${sid}`,
    category_vector: `hmac-sha256:${cat}`,
    category_path_hash: `sha256:${await sha256Hex(category)}`,
    ruleset_hash: `sha256:${rHash}`,
    epoch,
    stored_raw_data: false,
    stores_title: false,
    stores_path: false,
    stores_server_name: false,
    stores_url: false,
    stores_description: false,
    stores_media: false,
    stores_user_data: false
  };

  return { ...core, receipt_hash: `sha256:${await sha256Hex(canon(core))}` };
}

function countBy(arr, fn) {
  const out = {};
  for (const x of arr) {
    const k = fn(x);
    out[k] = (out[k] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort((a,b)=>a[0].localeCompare(b[0])));
}

function sortReceipts(receipts, mode) {
  const arr = [...receipts];
  const key = (r) => {
    if (mode === "source") return r.source_id;
    if (mode === "category") return r.category_vector;
    if (mode === "epoch") return r.epoch;
    if (mode === "entry") return r.entry_id;
    return r.receipt_hash;
  };
  arr.sort((a,b)=>key(a).localeCompare(key(b)));
  return arr;
}

function filterReceipts(receipts, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return receipts;
  return receipts.filter(r => canon(r).toLowerCase().includes(q));
}

async function bundleHash(bundleWithoutHash) {
  return `sha256:${await sha256Hex(canon(bundleWithoutHash))}`;
}

async function verifyBundleHash(obj, field = "bundle_hash") {
  if (!obj || !obj[field]) return { ok: false, reason: "missing hash field" };
  const claimed = obj[field];
  const copy = JSON.parse(JSON.stringify(obj));
  delete copy[field];
  const actual = await bundleHash(copy);
  return { ok: claimed === actual, claimed, actual };
}

async function verifySplitBundle(split) {
  const checks = {};
  for (const k of ["receipt_bundle", "policy_bundle", "normalize_bundle", "index_bundle", "arc_core_handoff_bundle", "arc_rar_export_bundle", "omnibinary_bundle", "validation_bundle"]) {
    checks[k] = await verifyBundleHash(split[k]);
  }
  const splitCopy = JSON.parse(JSON.stringify(split));
  const claimedCatalog = splitCopy.catalog_hash;
  delete splitCopy.catalog_hash;
  const actualCatalog = `sha256:${await sha256Hex(canon(splitCopy))}`;
  checks.catalog = { ok: claimedCatalog === actualCatalog, claimed: claimedCatalog, actual: actualCatalog };
  return {
    schema: "arc.seedcatalog.verify_report.v4",
    ok: Object.values(checks).every(x => x.ok),
    checks
  };
}

async function buildSplitBundles(doc, seed, epoch, options = {}) {
  const normalized = normalizeRows(doc);
  const rows = normalized.rows;
  const rHash = await rulesetHash();
  const receiptsRaw = [];

  for (const row of rows) receiptsRaw.push(await deriveReceipt(row, seed, epoch, rHash));
  const receipts = sortReceipts(receiptsRaw, options.sort || "receipt");

  const sourceSet = new Set(receipts.map(r => r.source_id));
  const categoryCountsByVector = countBy(receipts, r => r.category_vector);
  const sourceCounts = countBy(receipts, r => r.source_id);
  const epochCounts = countBy(receipts, r => r.epoch);

  const receiptBundleCore = {
    schema: "arc.seedcatalog.receipt_bundle.v4",
    bundle_role: "receipt_bundle",
    epoch,
    count: receipts.length,
    source_count: sourceSet.size,
    category_vector_counts: categoryCountsByVector,
    source_counts: sourceCounts,
    epoch_counts: epochCounts,
    receipts,
    stores_raw_data: false
  };
  const receiptBundle = { ...receiptBundleCore, bundle_hash: await bundleHash(receiptBundleCore) };

  const policyBundleCore = {
    schema: "arc.seedcatalog.policy_bundle.v4",
    bundle_role: "policy_bundle",
    ruleset: RULESET,
    ruleset_hash: `sha256:${rHash}`,
    raw_field_denylist: RAW_FIELD_DENYLIST,
    disallowed_storage: ["titles", "paths", "urls", "server_names", "hostnames", "media", "posters", "descriptions", "user_data"],
    lawful_use_only: true
  };
  const policyBundle = { ...policyBundleCore, bundle_hash: await bundleHash(policyBundleCore) };

  const adapterReportCore = {
    schema: "arc.seedcatalog.adapter_report.v4",
    bundle_role: "adapter_report",
    detected_shape: normalized.shape,
    detected_rows: rows.length,
    detected_sources: sourceSet.size,
    supported_shapes: ["servers", "sources", "data", "items", "flat_array", "object_map", "single_object"],
    stores_raw_data: false
  };
  const adapterReport = { ...adapterReportCore, bundle_hash: await bundleHash(adapterReportCore) };

  const normalizeBundleCore = {
    schema: "arc.seedcatalog.normalize_bundle.v4",
    bundle_role: "normalize_bundle",
    row_count: rows.length,
    detected_shape: normalized.shape,
    detected_sources: sourceSet.size,
    note: "Rows were normalized in volatile browser memory. Raw row fields are intentionally not exported.",
    adapter_report_hash: adapterReport.bundle_hash,
    stores_raw_data: false
  };
  const normalizeBundle = { ...normalizeBundleCore, bundle_hash: await bundleHash(normalizeBundleCore) };

  const indexBundleCore = {
    schema: "arc.seedcatalog.index_bundle.v4",
    bundle_role: "index_bundle",
    source_count: sourceSet.size,
    entry_count: receipts.length,
    category_vector_counts: categoryCountsByVector,
    source_counts: sourceCounts,
    epoch_counts: epochCounts,
    searchable_fields: ["receipt_hash", "entry_id", "source_id", "category_vector", "category_path_hash", "ruleset_hash"],
    stores_raw_data: false
  };
  const indexBundle = { ...indexBundleCore, bundle_hash: await bundleHash(indexBundleCore) };

  const arcCoreRecords = receipts.map(r => ({
    schema: "arc.core.seedcatalog_registration.v4",
    source: "arc-seedcatalog",
    object_type: "seedcatalog_entry_receipt",
    receipt_hash: r.receipt_hash,
    entry_id: r.entry_id,
    source_id: r.source_id,
    category_vector: r.category_vector,
    category_path_hash: r.category_path_hash,
    ruleset_hash: r.ruleset_hash,
    stores_raw_data: false,
    authority_policy: "zero-title-zero-url-zero-server-name-zero-user-data"
  }));

  const arcCoreBundleCore = {
    schema: "arc.core.seedcatalog_handoff_bundle.v4",
    bundle_role: "arc_core_handoff_bundle",
    object_type: "seedcatalog_receipt_bundle",
    receipt_bundle_hash: receiptBundle.bundle_hash,
    policy_bundle_hash: policyBundle.bundle_hash,
    index_bundle_hash: indexBundle.bundle_hash,
    ruleset_hash: `sha256:${rHash}`,
    source_count: sourceSet.size,
    entry_count: receipts.length,
    records: arcCoreRecords,
    stores_raw_data: false,
    authority_policy: "zero-title-zero-url-zero-server-name-zero-user-data",
    suggested_route: "POST /seedcatalog/register-bundle"
  };
  const arcCoreBundle = { ...arcCoreBundleCore, bundle_hash: await bundleHash(arcCoreBundleCore) };

  const arcRarBundleCore = {
    schema: "arc.rar.seedcatalog_manifest.v4",
    bundle_role: "arc_rar_manifest",
    include: ["receipt_bundle", "policy_bundle", "index_bundle", "arc_core_handoff_bundle", "omnibinary_bundle", "validation_bundle", "adapter_report"],
    exclude: ["raw_input_bundle", "resolver_runtime_map", "titles", "paths", "urls", "server_names", "hostnames", "media", "user_data"],
    receipt_bundle_hash: receiptBundle.bundle_hash,
    arc_core_bundle_hash: arcCoreBundle.bundle_hash,
    policy_bundle_hash: policyBundle.bundle_hash,
    stores_raw_data: false
  };
  const arcRarBundle = { ...arcRarBundleCore, bundle_hash: await bundleHash(arcRarBundleCore) };

  const omnibinaryBundleCore = {
    schema: "omnibinary.seedcatalog_hash_report.v4",
    bundle_role: "omnibinary_hash_report",
    canonicalization: "sorted-key-json-to-utf8-bytes",
    hash_algorithm: "SHA-256",
    hmac_algorithm: "HMAC-SHA-256",
    receipt_bundle_hash: receiptBundle.bundle_hash,
    policy_bundle_hash: policyBundle.bundle_hash,
    index_bundle_hash: indexBundle.bundle_hash,
    arc_core_bundle_hash: arcCoreBundle.bundle_hash,
    arc_rar_bundle_hash: arcRarBundle.bundle_hash,
    stores_raw_data: false
  };
  const omnibinaryBundle = { ...omnibinaryBundleCore, bundle_hash: await bundleHash(omnibinaryBundleCore) };

  const validationBundleCore = {
    schema: "arc.seedcatalog.validation_bundle.v4",
    bundle_role: "validation_bundle",
    checks: {
      has_receipts: receipts.length > 0,
      stores_raw_data: false,
      ruleset_hash_present: true,
      arc_core_handoff_present: true,
      denied_raw_fields_exported: false,
      adapter_report_present: true,
      jsonl_export_available: true
    },
    warning: "Validation checks exported bundles only. It does not certify source legality."
  };
  const validationBundle = { ...validationBundleCore, bundle_hash: await bundleHash(validationBundleCore) };

  const splitCore = {
    schema: "arc.seedcatalog.split_bundle.v4",
    created_at: new Date().toISOString(),
    architecture: "palantir_arc_core_split_bundle_static",
    receipt_bundle: receiptBundle,
    policy_bundle: policyBundle,
    adapter_report: adapterReport,
    normalize_bundle: normalizeBundle,
    index_bundle: indexBundle,
    arc_core_handoff_bundle: arcCoreBundle,
    arc_rar_export_bundle: arcRarBundle,
    omnibinary_bundle: omnibinaryBundle,
    validation_bundle: validationBundle,
    stores_raw_data: false
  };
  return { ...splitCore, catalog_hash: `sha256:${await sha256Hex(canon(splitCore))}` };
}

function arcCoreJSONL(split) {
  return split.arc_core_handoff_bundle.records.map(r => JSON.stringify(r)).join("\n") + "\n";
}

window.ARCSeedCatalog = {
  RULESET,
  RAW_FIELD_DENYLIST,
  detectShape,
  normalizeRows,
  buildSplitBundles,
  verifySplitBundle,
  verifyBundleHash,
  sortReceipts,
  filterReceipts,
  arcCoreJSONL,
  canon,
  sha256Hex,
  hmacSha256Hex
};

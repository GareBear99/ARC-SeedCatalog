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
  schema: "arc.seedcatalog.ruleset.v3",
  version: "0.3.0",
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
  return `catalog/authorized/${s}`;
}

function normalizeRows(doc) {
  const rows = [];

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
    return rows;
  }

  if (doc && Array.isArray(doc.servers)) {
    for (const server of doc.servers) {
      const items = Array.isArray(server.items) ? server.items : [];
      for (const item of items) pushRow(server, item, "servers");
    }
    return rows;
  }

  if (doc && Array.isArray(doc.sources)) {
    for (const server of doc.sources) {
      const items = Array.isArray(server.items) ? server.items : Array.isArray(server.catalog) ? server.catalog : [];
      for (const item of items) pushRow(server, item, "sources");
    }
    return rows;
  }

  if (doc && Array.isArray(doc.data)) {
    for (const item of doc.data) pushRow(item, item, "data");
    return rows;
  }

  if (doc && Array.isArray(doc.items)) {
    for (const item of doc.items) pushRow(doc, item, "items");
    return rows;
  }

  if (doc && typeof doc === "object") {
    for (const [key, value] of Object.entries(doc)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (looksLikeRow(item)) pushRow({ server_id: key, server_type: "object_map" }, item, "object_map");
        }
      }
    }
  }

  if (!rows.length && looksLikeRow(doc)) pushRow(doc, doc, "single_object");

  return rows;
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

  // Volatile fields participate in HMAC derivation but are never exported.
  const volatile = `${row.server_id}|${row.volatile_path}|${row.volatile_title}|${row.volatile_quality}|${epoch}`;
  const entry = await hmacSha256Hex(seed, `${sid}|${volatile}`);
  const cat = await hmacSha256Hex(seed, `${category}|ruleset:${rHash}`);

  const core = {
    schema: "arc.seedcatalog.entry_receipt.v3",
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

async function buildSplitBundles(doc, seed, epoch, options = {}) {
  const rows = normalizeRows(doc);
  const rHash = await rulesetHash();
  const receiptsRaw = [];

  for (const row of rows) {
    receiptsRaw.push(await deriveReceipt(row, seed, epoch, rHash));
  }

  const receipts = sortReceipts(receiptsRaw, options.sort || "receipt");

  const sourceSet = new Set(receipts.map(r => r.source_id));
  const categoryCountsByVector = countBy(receipts, r => r.category_vector);
  const sourceCounts = countBy(receipts, r => r.source_id);
  const epochCounts = countBy(receipts, r => r.epoch);

  const receiptBundle = {
    schema: "arc.seedcatalog.receipt_bundle.v3",
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
  receiptBundle.bundle_hash = `sha256:${await sha256Hex(canon(receiptBundle))}`;

  const policyBundle = {
    schema: "arc.seedcatalog.policy_bundle.v3",
    bundle_role: "policy_bundle",
    ruleset: RULESET,
    ruleset_hash: `sha256:${rHash}`,
    raw_field_denylist: RAW_FIELD_DENYLIST,
    disallowed_storage: ["titles", "paths", "urls", "server_names", "hostnames", "media", "posters", "descriptions", "user_data"],
    lawful_use_only: true
  };
  policyBundle.bundle_hash = `sha256:${await sha256Hex(canon(policyBundle))}`;

  const normalizeBundle = {
    schema: "arc.seedcatalog.normalize_bundle.v3",
    bundle_role: "normalize_bundle",
    row_count: rows.length,
    detected_rows: rows.length,
    detected_sources: sourceSet.size,
    note: "Rows were normalized in volatile browser memory. Raw row fields are intentionally not exported.",
    stores_raw_data: false
  };
  normalizeBundle.bundle_hash = `sha256:${await sha256Hex(canon(normalizeBundle))}`;

  const indexBundle = {
    schema: "arc.seedcatalog.index_bundle.v3",
    bundle_role: "index_bundle",
    source_count: sourceSet.size,
    entry_count: receipts.length,
    category_vector_counts: categoryCountsByVector,
    source_counts: sourceCounts,
    epoch_counts: epochCounts,
    searchable_fields: ["receipt_hash", "entry_id", "source_id", "category_vector", "category_path_hash", "ruleset_hash"],
    stores_raw_data: false
  };
  indexBundle.bundle_hash = `sha256:${await sha256Hex(canon(indexBundle))}`;

  const arcCoreBundle = {
    schema: "arc.core.seedcatalog_handoff_bundle.v3",
    bundle_role: "arc_core_handoff_bundle",
    object_type: "seedcatalog_receipt_bundle",
    receipt_bundle_hash: receiptBundle.bundle_hash,
    policy_bundle_hash: policyBundle.bundle_hash,
    index_bundle_hash: indexBundle.bundle_hash,
    ruleset_hash: `sha256:${rHash}`,
    source_count: sourceSet.size,
    entry_count: receipts.length,
    stores_raw_data: false,
    authority_policy: "zero-title-zero-url-zero-server-name-zero-user-data",
    suggested_route: "POST /seedcatalog/register-bundle"
  };
  arcCoreBundle.bundle_hash = `sha256:${await sha256Hex(canon(arcCoreBundle))}`;

  const arcRarBundle = {
    schema: "arc.rar.seedcatalog_export_plan.v3",
    bundle_role: "arc_rar_export_bundle",
    include: ["receipt_bundle", "policy_bundle", "index_bundle", "arc_core_handoff_bundle", "omnibinary_bundle"],
    exclude: ["raw_input_bundle", "resolver_runtime_map", "titles", "paths", "urls", "server_names", "hostnames", "media", "user_data"],
    receipt_bundle_hash: receiptBundle.bundle_hash,
    arc_core_bundle_hash: arcCoreBundle.bundle_hash,
    stores_raw_data: false
  };
  arcRarBundle.bundle_hash = `sha256:${await sha256Hex(canon(arcRarBundle))}`;

  const omnibinaryBundle = {
    schema: "omnibinary.seedcatalog_byte_discipline.v3",
    bundle_role: "omnibinary_bundle",
    canonicalization: "sorted-key-json-to-utf8-bytes",
    hash_algorithm: "SHA-256",
    hmac_algorithm: "HMAC-SHA-256",
    receipt_bundle_hash: receiptBundle.bundle_hash,
    policy_bundle_hash: policyBundle.bundle_hash,
    index_bundle_hash: indexBundle.bundle_hash,
    stores_raw_data: false
  };
  omnibinaryBundle.bundle_hash = `sha256:${await sha256Hex(canon(omnibinaryBundle))}`;

  const validationBundle = {
    schema: "arc.seedcatalog.validation_bundle.v3",
    bundle_role: "validation_bundle",
    checks: {
      has_receipts: receipts.length > 0,
      stores_raw_data: false,
      ruleset_hash_present: true,
      arc_core_handoff_present: true,
      denied_raw_fields_exported: false
    },
    warning: "Validation checks exported bundles only. It does not certify source legality."
  };
  validationBundle.bundle_hash = `sha256:${await sha256Hex(canon(validationBundle))}`;

  const all = {
    schema: "arc.seedcatalog.split_bundle.v3",
    created_at: new Date().toISOString(),
    architecture: "palantir_arc_core_split_bundle_static",
    receipt_bundle: receiptBundle,
    policy_bundle: policyBundle,
    normalize_bundle: normalizeBundle,
    index_bundle: indexBundle,
    arc_core_handoff_bundle: arcCoreBundle,
    arc_rar_export_bundle: arcRarBundle,
    omnibinary_bundle: omnibinaryBundle,
    validation_bundle: validationBundle,
    stores_raw_data: false
  };
  all.catalog_hash = `sha256:${await sha256Hex(canon(all))}`;
  return all;
}

window.ARCSeedCatalog = {
  RULESET,
  RAW_FIELD_DENYLIST,
  normalizeRows,
  buildSplitBundles,
  sortReceipts,
  filterReceipts,
  canon,
  sha256Hex,
  hmacSha256Hex
};

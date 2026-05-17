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
  schema: "arc.seedcatalog.ruleset.v2",
  version: "0.2.0",
  architecture: "palantir_split_bundle_static",
  allowed_category_prefixes: [
    "media/movie", "media/show", "media/public-domain", "media/licensed",
    "media/internal", "dataset/media", "game/homebrew", "asset/internal", "catalog/authorized"
  ],
  store_raw_names: false,
  store_raw_urls: false,
  store_server_names: false,
  store_user_data: false
};

function looksLikeRow(x) {
  return x && typeof x === "object" && !Array.isArray(x) &&
    ("path" in x || "url" in x || "title" in x || "name" in x || "id" in x || "category" in x);
}

function normalizeRows(doc) {
  const rows = [];
  const pushRow = (server, item) => {
    const category = item.category || item.genre || item.type || server.category || "catalog/authorized/uncategorized";
    const path = item.path || item.url || item.href || item.id || item.slug || item.title || item.name || JSON.stringify(item);
    rows.push({
      server_id: server.server_id || server.server || server.name || server.host || server.id || "source",
      server_type: server.server_type || server.type || "authorized_catalog",
      region: server.region || "unknown",
      legal_basis: server.legal_basis || "authorized_or_internal",
      capabilities: Array.isArray(server.capabilities) ? server.capabilities : [],
      path,
      title: item.title || item.name || "",
      category,
      quality: item.quality || item.resolution || "",
      raw_shape_hint: "volatile_only"
    });
  };

  if (Array.isArray(doc)) {
    for (const item of doc) pushRow(item, item);
    return rows;
  }

  if (doc.servers && Array.isArray(doc.servers)) {
    for (const server of doc.servers) {
      const items = Array.isArray(server.items) ? server.items : [];
      for (const item of items) pushRow(server, item);
    }
    return rows;
  }

  if (doc.data && Array.isArray(doc.data)) {
    for (const item of doc.data) pushRow(item, item);
    return rows;
  }

  for (const [key, value] of Object.entries(doc)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (looksLikeRow(item)) pushRow({ server_id: key, server_type: "object_map" }, item);
      }
    }
  }

  if (!rows.length && looksLikeRow(doc)) pushRow(doc, doc);
  return rows;
}

function safeSourceFingerprint(row) {
  return {
    server_type: row.server_type || "authorized_catalog",
    region: row.region || "unknown",
    legal_basis: row.legal_basis || "authorized_or_internal",
    capabilities: Array.isArray(row.capabilities) ? [...row.capabilities].sort() : []
  };
}

function validCategory(category) {
  return RULESET.allowed_category_prefixes.some(p => String(category).startsWith(p));
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
  const volatile = `${row.server_id}|${row.path}|${row.title}|${row.quality}|${epoch}`;
  const entry = await hmacSha256Hex(seed, `${sid}|${volatile}`);
  const cat = await hmacSha256Hex(seed, `${category}|ruleset:${rHash}`);
  const core = {
    schema: "arc.seedcatalog.entry_receipt.v2",
    entry_id: `hmac-sha256:${entry}`,
    source_id: `sha256:${sid}`,
    category_vector: `hmac-sha256:${cat}`,
    ruleset_hash: `sha256:${rHash}`,
    epoch,
    stored_raw_data: false,
    stores_title: false,
    stores_path: false,
    stores_server_name: false,
    stores_url: false,
    stores_user_data: false
  };
  return { ...core, receipt_hash: `sha256:${await sha256Hex(canon(core))}` };
}

async function buildSplitBundles(doc, seed, epoch) {
  const rows = normalizeRows(doc);
  const rHash = await rulesetHash();
  const receipts = [];
  const sourceSet = new Set();
  const categoryCounts = {};
  for (const row of rows) {
    const receipt = await deriveReceipt(row, seed, epoch, rHash);
    receipts.push(receipt);
    sourceSet.add(receipt.source_id);
    const cat = validCategory(row.category) ? row.category : "catalog/authorized/uncategorized";
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  }

  receipts.sort((a, b) => a.receipt_hash.localeCompare(b.receipt_hash));

  const receiptBundle = {
    schema: "arc.seedcatalog.receipt_bundle.v2",
    bundle_role: "receipt_bundle",
    epoch,
    count: receipts.length,
    source_count: sourceSet.size,
    category_counts: categoryCounts,
    receipts,
    stores_raw_data: false
  };
  receiptBundle.bundle_hash = `sha256:${await sha256Hex(canon(receiptBundle))}`;

  const policyBundle = {
    schema: "arc.seedcatalog.policy_bundle.v2",
    bundle_role: "policy_bundle",
    ruleset: RULESET,
    ruleset_hash: `sha256:${rHash}`,
    disallowed_storage: ["titles", "paths", "urls", "server_names", "hostnames", "media", "posters", "descriptions", "user_data"]
  };
  policyBundle.bundle_hash = `sha256:${await sha256Hex(canon(policyBundle))}`;

  const normalizeBundle = {
    schema: "arc.seedcatalog.normalize_bundle.v2",
    bundle_role: "normalize_bundle",
    row_count: rows.length,
    note: "Rows were normalized in volatile browser memory. Raw row fields are intentionally not exported.",
    stores_raw_data: false
  };
  normalizeBundle.bundle_hash = `sha256:${await sha256Hex(canon(normalizeBundle))}`;

  const arcCoreBundle = {
    schema: "arc.core.seedcatalog_handoff_bundle.v2",
    bundle_role: "arc_core_handoff_bundle",
    object_type: "seedcatalog_receipt_bundle",
    receipt_bundle_hash: receiptBundle.bundle_hash,
    policy_bundle_hash: policyBundle.bundle_hash,
    ruleset_hash: `sha256:${rHash}`,
    source_count: sourceSet.size,
    entry_count: receipts.length,
    stores_raw_data: false,
    authority_policy: "zero-title-zero-url-zero-server-name"
  };
  arcCoreBundle.bundle_hash = `sha256:${await sha256Hex(canon(arcCoreBundle))}`;

  const arcRarBundle = {
    schema: "arc.rar.seedcatalog_export_plan.v2",
    bundle_role: "arc_rar_export_bundle",
    include: ["receipt_bundle", "policy_bundle", "arc_core_handoff_bundle"],
    exclude: ["raw_input_bundle", "resolver_runtime_map", "titles", "paths", "urls", "server_names", "media"],
    receipt_bundle_hash: receiptBundle.bundle_hash,
    arc_core_bundle_hash: arcCoreBundle.bundle_hash,
    stores_raw_data: false
  };
  arcRarBundle.bundle_hash = `sha256:${await sha256Hex(canon(arcRarBundle))}`;

  const omniBinaryBundle = {
    schema: "omnibinary.seedcatalog_byte_discipline.v2",
    bundle_role: "omnibinary_bundle",
    canonicalization: "sorted-key-json-to-utf8-bytes",
    hash_algorithm: "SHA-256",
    hmac_algorithm: "HMAC-SHA-256",
    receipt_bundle_hash: receiptBundle.bundle_hash,
    stores_raw_data: false
  };
  omniBinaryBundle.bundle_hash = `sha256:${await sha256Hex(canon(omniBinaryBundle))}`;

  const all = {
    schema: "arc.seedcatalog.split_bundle.v2",
    created_at: new Date().toISOString(),
    architecture: "palantir_arc_core_split_bundle_static",
    receipt_bundle: receiptBundle,
    policy_bundle: policyBundle,
    normalize_bundle: normalizeBundle,
    arc_core_handoff_bundle: arcCoreBundle,
    arc_rar_export_bundle: arcRarBundle,
    omnibinary_bundle: omniBinaryBundle,
    stores_raw_data: false
  };
  all.catalog_hash = `sha256:${await sha256Hex(canon(all))}`;
  return all;
}

window.ARCSeedCatalog = { normalizeRows, buildSplitBundles, canon, sha256Hex, hmacSha256Hex, RULESET };

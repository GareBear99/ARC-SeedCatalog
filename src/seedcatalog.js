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
  schema: "arc.seedcatalog.ruleset.v5",
  version: "0.5.0",
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

const DEFAULT_CATEGORY_MAP = {
  schema: "arc.seedcatalog.category_map.v1",
  version: "0.5.0",
  fallback_category: "catalog/authorized/uncategorized",
  mappings: {
    "movie": "media/movie/authorized",
    "film": "media/movie/authorized",
    "tv": "media/show/authorized",
    "show": "media/show/authorized",
    "series": "media/show/authorized",
    "public": "media/public-domain/authorized",
    "public-domain": "media/public-domain/authorized",
    "licensed": "media/licensed/authorized",
    "internal": "asset/internal/authorized",
    "asset": "asset/internal/authorized",
    "game": "game/homebrew/authorized",
    "homebrew": "game/homebrew/authorized"
  }
};

const DEFAULT_ADAPTER_PROFILE = {
  schema: "arc.seedcatalog.adapter_profile.v1",
  name: "auto-flex",
  version: "0.5.0",
  server_array_paths: ["servers", "sources"],
  item_array_paths: ["items", "catalog", "data"],
  field_map: {
    server_id: ["server_id", "server", "source", "name", "host", "hostname", "id"],
    server_type: ["server_type", "source_type", "type"],
    region: ["region", "locale"],
    legal_basis: ["legal_basis", "license"],
    path: ["path", "url", "href", "id", "slug", "title", "name"],
    title: ["title", "name"],
    category: ["category", "categories", "genre", "type"],
    quality: ["quality", "resolution"]
  },
  export_raw_fields: false
};

const RAW_FIELD_DENYLIST = [
  "title", "name", "server", "server_id", "host", "hostname", "url", "href",
  "path", "poster", "image", "description", "overview", "stream", "stream_url",
  "watch_url", "embed", "cookie", "token", "authorization", "user", "email"
];

function firstField(obj, names, fallback = "") {
  for (const n of names) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, n) && obj[n] !== undefined && obj[n] !== null && obj[n] !== "") return obj[n];
  }
  return fallback;
}

function looksLikeRow(x, profile = DEFAULT_ADAPTER_PROFILE) {
  if (!x || typeof x !== "object" || Array.isArray(x)) return false;
  return Object.values(profile.field_map).flat().some(k => Object.prototype.hasOwnProperty.call(x, k));
}

function detectShape(doc) {
  if (Array.isArray(doc)) return "flat_array";
  if (doc && Array.isArray(doc.servers)) return "servers";
  if (doc && Array.isArray(doc.sources)) return "sources";
  if (doc && Array.isArray(doc.data)) return "data";
  if (doc && Array.isArray(doc.items)) return "items";
  if (doc && typeof doc === "object") {
    for (const value of Object.values(doc)) if (Array.isArray(value)) return "object_map";
    if (looksLikeRow(doc)) return "single_object";
  }
  return "unknown";
}

function normalizeCategory(raw, categoryMap = DEFAULT_CATEGORY_MAP) {
  if (Array.isArray(raw)) raw = raw[0] || "";
  let s = String(raw || "").trim().replace(/\s+/g, "-").toLowerCase();
  if (!s) return categoryMap.fallback_category;
  if (s.includes("/")) return s;
  if (categoryMap.mappings[s]) return categoryMap.mappings[s];
  for (const [k, v] of Object.entries(categoryMap.mappings)) {
    if (s.includes(k)) return v;
  }
  return `catalog/authorized/${s}`;
}

function normalizeRows(doc, profile = DEFAULT_ADAPTER_PROFILE, categoryMap = DEFAULT_CATEGORY_MAP) {
  const rows = [];
  const shape = detectShape(doc);

  const pushRow = (server, item, origin = "unknown") => {
    const fm = profile.field_map;
    const rawCategory = firstField(item, fm.category, firstField(server, fm.category, ""));
    const category = normalizeCategory(rawCategory, categoryMap);
    const volatilePath = firstField(item, fm.path, JSON.stringify(item));
    rows.push({
      server_id: firstField(server, fm.server_id, origin || "source"),
      server_type: firstField(server, fm.server_type, "authorized_catalog"),
      region: firstField(server, fm.region, "unknown"),
      legal_basis: firstField(server, fm.legal_basis, "authorized_or_internal"),
      capabilities: Array.isArray(server.capabilities) ? server.capabilities : [],
      volatile_path: volatilePath,
      volatile_title: firstField(item, fm.title, ""),
      volatile_quality: firstField(item, fm.quality, ""),
      category,
      origin_shape: origin
    });
  };

  if (Array.isArray(doc)) {
    for (const item of doc) pushRow(item, item, "flat_array");
  } else if (doc && Array.isArray(doc.servers)) {
    for (const server of doc.servers) for (const item of (server.items || server.catalog || [])) pushRow(server, item, "servers");
  } else if (doc && Array.isArray(doc.sources)) {
    for (const server of doc.sources) for (const item of (server.items || server.catalog || [])) pushRow(server, item, "sources");
  } else if (doc && Array.isArray(doc.data)) {
    for (const item of doc.data) pushRow(item, item, "data");
  } else if (doc && Array.isArray(doc.items)) {
    for (const item of doc.items) pushRow(doc, item, "items");
  } else if (doc && typeof doc === "object") {
    for (const [key, value] of Object.entries(doc)) {
      if (Array.isArray(value)) {
        for (const item of value) if (looksLikeRow(item, profile)) pushRow({ server_id: key, server_type: "object_map" }, item, "object_map");
      }
    }
    if (!rows.length && looksLikeRow(doc, profile)) pushRow(doc, doc, "single_object");
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

async function categoryMapHash(categoryMap = DEFAULT_CATEGORY_MAP) {
  return await sha256Hex(canon(categoryMap));
}

async function adapterProfileHash(profile = DEFAULT_ADAPTER_PROFILE) {
  return await sha256Hex(canon(profile));
}

async function sourceId(row) {
  return await sha256Hex(canon(safeSourceFingerprint(row)));
}

async function bundleHash(core) {
  return `sha256:${await sha256Hex(canon(core))}`;
}

async function deriveReceipt(row, seed, epoch, rHash, cHash, aHash) {
  const category = validCategory(row.category) ? row.category : DEFAULT_CATEGORY_MAP.fallback_category;
  const sid = await sourceId(row);
  const volatile = `${row.server_id}|${row.volatile_path}|${row.volatile_title}|${row.volatile_quality}|${epoch}`;
  const entry = await hmacSha256Hex(seed, `${sid}|${volatile}`);
  const cat = await hmacSha256Hex(seed, `${category}|ruleset:${rHash}|category_map:${cHash}`);

  const core = {
    schema: "arc.seedcatalog.entry_receipt.v5",
    entry_id: `hmac-sha256:${entry}`,
    source_id: `sha256:${sid}`,
    category_vector: `hmac-sha256:${cat}`,
    category_path_hash: `sha256:${await sha256Hex(category)}`,
    ruleset_hash: `sha256:${rHash}`,
    category_map_hash: `sha256:${cHash}`,
    adapter_profile_hash: `sha256:${aHash}`,
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
  const key = r => mode === "source" ? r.source_id : mode === "category" ? r.category_vector : mode === "epoch" ? r.epoch : mode === "entry" ? r.entry_id : r.receipt_hash;
  arr.sort((a,b)=>key(a).localeCompare(key(b)));
  return arr;
}

function filterReceipts(receipts, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return receipts;
  return receipts.filter(r => canon(r).toLowerCase().includes(q));
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
  for (const k of ["receipt_bundle","policy_bundle","adapter_bundle","category_map_bundle","normalize_bundle","index_bundle","arc_core_handoff_bundle","arc_rar_export_bundle","omnibinary_bundle","validation_bundle"]) {
    checks[k] = await verifyBundleHash(split[k]);
  }
  const splitCopy = JSON.parse(JSON.stringify(split));
  const claimedCatalog = splitCopy.catalog_hash;
  delete splitCopy.catalog_hash;
  const actualCatalog = `sha256:${await sha256Hex(canon(splitCopy))}`;
  checks.catalog = { ok: claimedCatalog === actualCatalog, claimed: claimedCatalog, actual: actualCatalog };
  return { schema: "arc.seedcatalog.verify_report.v5", ok: Object.values(checks).every(x => x.ok), checks };
}

async function buildSplitBundles(doc, seed, epoch, options = {}) {
  const profile = options.profile || DEFAULT_ADAPTER_PROFILE;
  const categoryMap = options.categoryMap || DEFAULT_CATEGORY_MAP;
  const normalized = normalizeRows(doc, profile, categoryMap);
  const rows = normalized.rows;
  const rHash = await rulesetHash();
  const cHash = await categoryMapHash(categoryMap);
  const aHash = await adapterProfileHash(profile);

  const receiptsRaw = [];
  for (const row of rows) receiptsRaw.push(await deriveReceipt(row, seed, epoch, rHash, cHash, aHash));
  const receipts = sortReceipts(receiptsRaw, options.sort || "receipt");

  const sourceSet = new Set(receipts.map(r => r.source_id));
  const categoryCountsByVector = countBy(receipts, r => r.category_vector);
  const sourceCounts = countBy(receipts, r => r.source_id);
  const epochCounts = countBy(receipts, r => r.epoch);

  const receiptBundleCore = { schema:"arc.seedcatalog.receipt_bundle.v5", bundle_role:"receipt_bundle", epoch, count:receipts.length, source_count:sourceSet.size, category_vector_counts:categoryCountsByVector, source_counts:sourceCounts, epoch_counts:epochCounts, receipts, stores_raw_data:false };
  const receipt_bundle = { ...receiptBundleCore, bundle_hash: await bundleHash(receiptBundleCore) };

  const policyBundleCore = { schema:"arc.seedcatalog.policy_bundle.v5", bundle_role:"policy_bundle", ruleset:RULESET, ruleset_hash:`sha256:${rHash}`, raw_field_denylist:RAW_FIELD_DENYLIST, disallowed_storage:["titles","paths","urls","server_names","hostnames","media","posters","descriptions","user_data"], lawful_use_only:true };
  const policy_bundle = { ...policyBundleCore, bundle_hash: await bundleHash(policyBundleCore) };

  const adapterBundleCore = { schema:"arc.seedcatalog.adapter_bundle.v5", bundle_role:"adapter_bundle", adapter_profile:profile, adapter_profile_hash:`sha256:${aHash}`, detected_shape:normalized.shape, detected_rows:rows.length, detected_sources:sourceSet.size, stores_raw_data:false };
  const adapter_bundle = { ...adapterBundleCore, bundle_hash: await bundleHash(adapterBundleCore) };

  const categoryMapBundleCore = { schema:"arc.seedcatalog.category_map_bundle.v5", bundle_role:"category_map_bundle", category_map:categoryMap, category_map_hash:`sha256:${cHash}`, stores_raw_data:false };
  const category_map_bundle = { ...categoryMapBundleCore, bundle_hash: await bundleHash(categoryMapBundleCore) };

  const normalizeBundleCore = { schema:"arc.seedcatalog.normalize_bundle.v5", bundle_role:"normalize_bundle", row_count:rows.length, detected_shape:normalized.shape, detected_sources:sourceSet.size, note:"Rows normalized in volatile browser memory. Raw row fields are intentionally not exported.", adapter_bundle_hash:adapter_bundle.bundle_hash, category_map_bundle_hash:category_map_bundle.bundle_hash, stores_raw_data:false };
  const normalize_bundle = { ...normalizeBundleCore, bundle_hash: await bundleHash(normalizeBundleCore) };

  const indexBundleCore = { schema:"arc.seedcatalog.index_bundle.v5", bundle_role:"index_bundle", source_count:sourceSet.size, entry_count:receipts.length, category_vector_counts:categoryCountsByVector, source_counts:sourceCounts, epoch_counts:epochCounts, searchable_fields:["receipt_hash","entry_id","source_id","category_vector","category_path_hash","ruleset_hash","category_map_hash","adapter_profile_hash"], stores_raw_data:false };
  const index_bundle = { ...indexBundleCore, bundle_hash: await bundleHash(indexBundleCore) };

  const records = receipts.map(r => ({ schema:"arc.core.seedcatalog_registration.v5", source:"arc-seedcatalog", object_type:"seedcatalog_entry_receipt", receipt_hash:r.receipt_hash, entry_id:r.entry_id, source_id:r.source_id, category_vector:r.category_vector, category_path_hash:r.category_path_hash, ruleset_hash:r.ruleset_hash, category_map_hash:r.category_map_hash, adapter_profile_hash:r.adapter_profile_hash, stores_raw_data:false, authority_policy:"zero-title-zero-url-zero-server-name-zero-user-data" }));

  const arcCoreBundleCore = { schema:"arc.core.seedcatalog_handoff_bundle.v5", bundle_role:"arc_core_handoff_bundle", object_type:"seedcatalog_receipt_bundle", receipt_bundle_hash:receipt_bundle.bundle_hash, policy_bundle_hash:policy_bundle.bundle_hash, index_bundle_hash:index_bundle.bundle_hash, adapter_bundle_hash:adapter_bundle.bundle_hash, category_map_bundle_hash:category_map_bundle.bundle_hash, ruleset_hash:`sha256:${rHash}`, source_count:sourceSet.size, entry_count:receipts.length, records, stores_raw_data:false, authority_policy:"zero-title-zero-url-zero-server-name-zero-user-data", suggested_route:"POST /seedcatalog/register-bundle" };
  const arc_core_handoff_bundle = { ...arcCoreBundleCore, bundle_hash: await bundleHash(arcCoreBundleCore) };

  const arcRarBundleCore = { schema:"arc.rar.seedcatalog_manifest.v5", bundle_role:"arc_rar_manifest", include:["receipt_bundle","policy_bundle","index_bundle","adapter_bundle","category_map_bundle","arc_core_handoff_bundle","omnibinary_bundle","validation_bundle"], exclude:["raw_input_bundle","resolver_runtime_map","titles","paths","urls","server_names","hostnames","media","user_data"], receipt_bundle_hash:receipt_bundle.bundle_hash, arc_core_bundle_hash:arc_core_handoff_bundle.bundle_hash, policy_bundle_hash:policy_bundle.bundle_hash, stores_raw_data:false };
  const arc_rar_export_bundle = { ...arcRarBundleCore, bundle_hash: await bundleHash(arcRarBundleCore) };

  const omnibinaryBundleCore = { schema:"omnibinary.seedcatalog_hash_report.v5", bundle_role:"omnibinary_hash_report", canonicalization:"sorted-key-json-to-utf8-bytes", hash_algorithm:"SHA-256", hmac_algorithm:"HMAC-SHA-256", receipt_bundle_hash:receipt_bundle.bundle_hash, policy_bundle_hash:policy_bundle.bundle_hash, index_bundle_hash:index_bundle.bundle_hash, adapter_bundle_hash:adapter_bundle.bundle_hash, category_map_bundle_hash:category_map_bundle.bundle_hash, arc_core_bundle_hash:arc_core_handoff_bundle.bundle_hash, arc_rar_bundle_hash:arc_rar_export_bundle.bundle_hash, stores_raw_data:false };
  const omnibinary_bundle = { ...omnibinaryBundleCore, bundle_hash: await bundleHash(omnibinaryBundleCore) };

  const validationBundleCore = { schema:"arc.seedcatalog.validation_bundle.v5", bundle_role:"validation_bundle", checks:{ has_receipts:receipts.length>0, stores_raw_data:false, ruleset_hash_present:true, arc_core_handoff_present:true, denied_raw_fields_exported:false, adapter_profile_present:true, category_map_present:true, jsonl_export_available:true }, warning:"Validation checks exported bundles only. It does not certify source legality." };
  const validation_bundle = { ...validationBundleCore, bundle_hash: await bundleHash(validationBundleCore) };

  const splitCore = { schema:"arc.seedcatalog.split_bundle.v5", created_at:new Date().toISOString(), architecture:"palantir_arc_core_split_bundle_static", receipt_bundle, policy_bundle, adapter_bundle, category_map_bundle, normalize_bundle, index_bundle, arc_core_handoff_bundle, arc_rar_export_bundle, omnibinary_bundle, validation_bundle, stores_raw_data:false };
  return { ...splitCore, catalog_hash:`sha256:${await sha256Hex(canon(splitCore))}` };
}

function arcCoreJSONL(split) {
  return split.arc_core_handoff_bundle.records.map(r => JSON.stringify(r)).join("\n") + "\n";
}

function proofPack(split) {
  return {
    schema: "arc.seedcatalog.proof_pack.v5",
    manifest: split.arc_rar_export_bundle,
    receipt_bundle: split.receipt_bundle,
    policy_bundle: split.policy_bundle,
    index_bundle: split.index_bundle,
    adapter_bundle: split.adapter_bundle,
    category_map_bundle: split.category_map_bundle,
    arc_core_handoff_bundle: split.arc_core_handoff_bundle,
    omnibinary_bundle: split.omnibinary_bundle,
    validation_bundle: split.validation_bundle,
    stores_raw_data: false
  };
}

window.ARCSeedCatalog = {
  RULESET, DEFAULT_CATEGORY_MAP, DEFAULT_ADAPTER_PROFILE, RAW_FIELD_DENYLIST,
  detectShape, normalizeRows, buildSplitBundles, verifySplitBundle, verifyBundleHash,
  sortReceipts, filterReceipts, arcCoreJSONL, proofPack, canon, sha256Hex, hmacSha256Hex
};

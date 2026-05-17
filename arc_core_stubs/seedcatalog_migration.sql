CREATE TABLE IF NOT EXISTS seedcatalog_records (
  receipt_hash TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  category_vector TEXT NOT NULL,
  category_path_hash TEXT NOT NULL,
  ruleset_hash TEXT NOT NULL,
  category_map_hash TEXT,
  adapter_profile_hash TEXT,
  policy_status TEXT NOT NULL DEFAULT 'accepted',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  stores_raw_data INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_seedcatalog_source_id ON seedcatalog_records(source_id);
CREATE INDEX IF NOT EXISTS idx_seedcatalog_category_vector ON seedcatalog_records(category_vector);

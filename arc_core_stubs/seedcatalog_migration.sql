CREATE TABLE IF NOT EXISTS seedcatalog_records (receipt_hash TEXT PRIMARY KEY, entry_id TEXT, source_id TEXT, category_vector TEXT, stores_raw_data INTEGER DEFAULT 0);

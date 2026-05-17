#!/usr/bin/env bash
set -euo pipefail
mkdir -p out
python cli/arc_seedcatalog/cli.py ingest examples/catalogs/canonical_servers.example.json --seed smoke --epoch 2026-05-16 --out out/split.json
python cli/arc_seedcatalog/cli.py verify out/split.json
python cli/arc_seedcatalog/cli.py audit-leaks out/split.json
HASH=$(python - <<'PY'
import json
print(json.load(open('out/split.json'))['catalog_hash'])
PY
)
python cli/arc_seedcatalog/cli.py replay examples/catalogs/canonical_servers.example.json --seed smoke --epoch 2026-05-16 --expect-hash "$HASH"
python cli/arc_seedcatalog/cli.py export-jsonl out/split.json --out out/records.jsonl
python cli/arc_seedcatalog/cli.py proof-pack out/split.json --out out/proof-pack.json
python cli/arc_seedcatalog/cli.py zip-pack out/split.json --out out/proof-pack.zip
python cli/arc_seedcatalog/cli.py export-binary out/split.json --out out/split.arcbin
python cli/arc_seedcatalog/cli.py verify-binary out/split.arcbin
echo "ARC-SeedCatalog v0.9 smoke passed"

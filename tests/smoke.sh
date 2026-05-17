mkdir -p out
python cli/arc_seedcatalog/cli.py ingest examples/catalogs/canonical_servers.example.json --seed smoke --epoch 2026-05-16 --out out/split.json
python cli/arc_seedcatalog/cli.py verify out/split.json
python cli/arc_seedcatalog/cli.py export-jsonl out/split.json --out out/records.jsonl
python cli/arc_seedcatalog/cli.py proof-pack out/split.json --out out/proof-pack.json
python cli/arc_seedcatalog/cli.py zip-pack out/split.json --out out/proof-pack.zip
echo passed

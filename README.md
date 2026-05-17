# ARC-SeedCatalog v0.6.0

Static + CLI Palantir-style ARC-Core split-bundle catalog ingestion for authorized server/source JSON.

ARC-SeedCatalog ingests flexible authorized catalog JSON, normalizes rows in volatile memory, and exports ARC-safe proof bundles without preserving raw titles, URLs, paths, server names, hostnames, descriptions, posters, media, or user data.

## Complete v0.6 foundation

- GitHub Pages static app
- CLI companion
- adapter profiles
- category maps
- receipt bundles
- policy bundles
- ARC-Core handoff JSON
- ARC-Core JSONL export
- ARC-Core FastAPI route stub
- SQLite migration
- Arc-RAR proof-pack template
- zip proof-pack export
- OmniBinary hash discipline
- signing-ready envelope
- seed-vault docs
- schemas/examples/tests

## Static app

Open:

```text
index.html
```

## CLI

```bash
python cli/arc_seedcatalog/cli.py ingest examples/catalogs/canonical_servers.example.json --seed local-dev --epoch 2026-05-16 --out out/split.json
python cli/arc_seedcatalog/cli.py verify out/split.json
python cli/arc_seedcatalog/cli.py export-jsonl out/split.json --out out/records.jsonl
python cli/arc_seedcatalog/cli.py proof-pack out/split.json --out out/proof-pack.json
python cli/arc_seedcatalog/cli.py zip-pack out/split.json --out out/proof-pack.zip
```

## Legal boundary

Use only for lawful, authorized, public-domain, licensed, internal, owned, homebrew, or synthetic catalogs.

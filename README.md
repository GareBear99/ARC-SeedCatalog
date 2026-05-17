# ARC-SeedCatalog v0.7.0 — Verified + Benchmarked

ARC-SeedCatalog is a static + CLI, Palantir-style ARC-Core split-bundle catalog ingester for authorized server/source JSON.

It ingests flexible authorized catalog JSON, normalizes rows in volatile memory, derives opaque seeded receipts, and exports ARC-safe proof bundles without preserving raw titles, URLs, paths, server names, hostnames, descriptions, posters, media, or user data.

## v0.7.0

This release adds package-wide validation and benchmark reports:

- static GitHub Pages app
- CLI companion
- ARC-Core route stub
- SQLite migration
- Arc-RAR proof-pack template
- zip proof-pack export
- OmniBinary hash discipline docs
- signing-ready envelope
- benchmark script
- generated benchmark report
- smoke tests
- examples for canonical, flat, data-wrapped, and synthetic catalogs

## CLI

```bash
python cli/arc_seedcatalog/cli.py ingest examples/catalogs/canonical_servers.example.json --seed local-dev --epoch 2026-05-16 --out out/split.json
python cli/arc_seedcatalog/cli.py verify out/split.json
python cli/arc_seedcatalog/cli.py export-jsonl out/split.json --out out/records.jsonl
python cli/arc_seedcatalog/cli.py proof-pack out/split.json --out out/proof-pack.json
python cli/arc_seedcatalog/cli.py zip-pack out/split.json --out out/proof-pack.zip
python benchmarks/benchmark_cli.py
```

## Legal boundary

Use only for lawful, authorized, public-domain, licensed, internal, owned, homebrew, or synthetic catalogs.

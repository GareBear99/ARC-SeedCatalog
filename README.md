# ARC-SeedCatalog v0.8.0 — Adversarial + Replay + Signing-Ready

ARC-SeedCatalog is a static + CLI, Palantir-style ARC-Core split-bundle catalog ingester for authorized server/source JSON.

v0.8 is the DARPA-style hardening pass:

- leak scanner
- adversarial fixtures
- deterministic replay gate
- signing-ready envelope
- ARC-Core receiver upgrade
- Arc-RAR proof-pack structure
- OmniBinary `.arcbin` binary export scaffold
- benchmark matrix
- generated validation reports

## Core rule

Raw data may appear in input. Exported proof bundles must not preserve raw titles, URLs, paths, server names, hostnames, stream links, descriptions, posters, media, or user data.

## CLI

```bash
python cli/arc_seedcatalog/cli.py ingest examples/catalogs/canonical_servers.example.json --seed local-dev --epoch 2026-05-16 --out out/split.json
python cli/arc_seedcatalog/cli.py verify out/split.json
python cli/arc_seedcatalog/cli.py audit-leaks out/split.json
python cli/arc_seedcatalog/cli.py replay examples/catalogs/canonical_servers.example.json --seed local-dev --epoch 2026-05-16 --expect-hash sha256:...
python cli/arc_seedcatalog/cli.py export-jsonl out/split.json --out out/records.jsonl
python cli/arc_seedcatalog/cli.py proof-pack out/split.json --out out/proof-pack.json
python cli/arc_seedcatalog/cli.py zip-pack out/split.json --out out/proof-pack.zip
python cli/arc_seedcatalog/cli.py export-binary out/split.json --out out/split.arcbin
python cli/arc_seedcatalog/cli.py verify-binary out/split.arcbin
python benchmarks/benchmark_cli.py
```

## Legal boundary

Use only for lawful, authorized, public-domain, licensed, internal, owned, homebrew, or synthetic catalogs.

# ARC-SeedCatalog

**Static zero-title split-bundle catalog ingestion for ARC-Core, Arc-RAR, and OmniBinary.**

ARC-SeedCatalog converts authorized server/source/catalog JSON into verifiable ARC proof bundles without exporting raw titles, URLs, paths, server names, hostnames, stream links, media, descriptions, posters, or user data.

It is designed for public-domain catalogs, licensed APIs, owned/internal inventories, homebrew/demo catalogs, synthetic test feeds, and authorized dataset indexes.

> Input can contain raw fields temporarily. Exported proof bundles do not preserve them.

## Why this exists

Most catalog systems preserve human-readable data. ARC-SeedCatalog does the opposite: it uses raw source fields only as volatile derivation inputs, then exports opaque receipts, hashes, category vectors, ARC-Core registration records, and proof-pack structures.

```text
authorized JSON
  -> volatile normalization
  -> HMAC seeded entry IDs
  -> source hashes
  -> category vectors
  -> receipt bundle
  -> ARC-Core handoff JSONL
  -> Arc-RAR proof pack
  -> OmniBinary .arcbin
```

## Features

- Static GitHub Pages app
- CLI companion
- Flexible JSON ingestion
- Leak scanner
- Deterministic replay check
- Adversarial test fixtures
- ARC-Core receiver stubs
- ARC-Core SQLite migration
- Arc-RAR proof-pack template
- OmniBinary `.arcbin` binary export scaffold
- Signing-ready envelope
- Benchmark and validation reports
- Public-facing documentation
- GitHub issue templates and release checklist

## Quick start

```bash
python cli/arc_seedcatalog/cli.py ingest examples/catalogs/canonical_servers.example.json \
  --seed local-dev \
  --epoch 2026-05-16 \
  --out out/split.json

python cli/arc_seedcatalog/cli.py verify out/split.json
python cli/arc_seedcatalog/cli.py audit-leaks out/split.json
python cli/arc_seedcatalog/cli.py export-jsonl out/split.json --out out/records.jsonl
python cli/arc_seedcatalog/cli.py export-binary out/split.json --out out/split.arcbin
python cli/arc_seedcatalog/cli.py verify-binary out/split.arcbin
```

## Static app

Open:

```text
index.html
```

or deploy to GitHub Pages.

## Supported input shapes

```json
{
  "servers": [
    {
      "server_id": "public-domain-node-a",
      "server_type": "authorized_catalog",
      "region": "CA",
      "legal_basis": "public_domain_or_licensed",
      "items": [
        {
          "path": "/catalog/public-domain/item/001",
          "category": "movie",
          "title": "Temporary Demo Title"
        }
      ]
    }
  ]
}
```

Also supports flat arrays, `data` arrays, `items` arrays, and object maps.

## Exported bundles

```text
receipt_bundle
policy_bundle
arc_core_handoff_bundle
signature_envelope
catalog_hash
ARC-Core JSONL records
Arc-RAR style proof pack
OmniBinary .arcbin
```

## What is not exported

```text
titles
paths
URLs
server names
hostnames
stream links
media files
posters
descriptions
tokens
cookies
emails
user data
raw input JSON
```

## Validation status

v0.9 was generated with:

- benchmark ingest pass
- leak scanner pass
- adversarial fixture pass
- deterministic replay pass
- JSONL export pass
- proof-pack export pass
- OmniBinary `.arcbin` export/verify pass

See:

```text
docs/VALIDATION_REPORT.md
docs/BENCHMARK_REPORT.md
docs/ADVERSARIAL_REPORT.md
docs/PRODUCTION_READINESS.md
```

## Legal boundary

ARC-SeedCatalog is for lawful authorized catalogs only. Do not use it for piracy mirroring, unauthorized streaming routes, hidden host preservation, access-control bypass, or user tracking without consent.

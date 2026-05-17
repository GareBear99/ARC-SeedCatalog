# ARC-SeedCatalog — Palantir ARC-Core Split Bundle

**ARC-SeedCatalog v0.3.0** is a static GitHub Pages-ready catalog ingestion tool for authorized server/source JSON.

It ingests broad JSON shapes, normalizes them in browser memory, sorts/groups/searches the derived catalog, then exports ARC-safe split bundles.

## Core promise

```text
Ingest flexible authorized server/source JSON.
Do not store raw server names, titles, URLs, paths, media, descriptions, posters, or user data.
Export only opaque seeded IDs, source hashes, category vectors, policy, receipts, and ARC-Core handoff bundles.
```

## Split-bundle architecture

```text
Input Bundle       temporary user-provided JSON, not exported by default
Normalize Bundle   proof of volatile normalization
Receipt Bundle     opaque source/entry/category receipt records
Policy Bundle      no-title/no-url/no-server-name rules
Index Bundle       category/source/count/search metadata without raw names
ARC-Core Bundle    safe authority registration payload
Arc-RAR Bundle     portable proof/export plan
OmniBinary Bundle  canonical byte/hash discipline
```

## Static features

- no backend
- no database
- no build step
- runs on GitHub Pages
- paste JSON or upload JSON
- accepts multiple JSON shapes
- derives source hashes and entry IDs with Web Crypto
- category grouping
- source grouping
- search receipts by hash/category/source
- sort by receipt/source/category/epoch
- export all bundles
- export ARC-Core handoff only
- export Arc-RAR style proof plan
- export receipt bundle only
- generate a static validation report in-browser

## Legal boundary

This project is source-agnostic at the JSON-shape level, but it is only intended for authorized/public-domain/licensed/internal/owned catalogs.

Do not use it to mirror piracy sites, preserve unauthorized streaming hosts, route unlicensed streams, bypass access controls, or store hidden server lists.

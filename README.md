# ARC-SeedCatalog — Palantir-Style Split Bundle Static Demo

ARC-SeedCatalog v0.2.0 is a static GitHub Pages-ready ingestion system for authorized server/catalog JSON.

It uses a **Palantir-style split-bundle architecture**:

```text
Input Bundle      = temporary server/catalog JSON
Normalize Bundle  = canonical volatile rows
Receipt Bundle    = opaque entry/source/category receipts
Policy Bundle     = no-title/no-url/no-server/user-data rules
Resolver Bundle   = temporary in-browser lookup map only
ARC-Core Bundle   = safe authority handoff payload
Arc-RAR Bundle    = portable proof/export package
OmniBinary Bundle = canonical byte/hash discipline
```

## Core rule

The system can ingest a JSON file that contains server-ish fields, but the exported ARC catalog does **not** store raw:

- server names
- hostnames
- stream URLs
- titles
- paths
- media files
- posters
- descriptions
- user data

It stores only:

- opaque source hashes
- opaque seeded entry IDs
- category vectors
- ruleset hash
- receipt hashes
- catalog receipt hash
- counts/group summaries

## Runs statically

No backend. No database. No server. No build step.

Open:

```text
index.html
```

or deploy to GitHub Pages.

## Input formats

Supports:

- canonical `{ servers: [...] }`
- flat arrays of rows
- wrapped `{ data: [...] }`
- generic object maps with rows inside

## Legal boundary

Use only for authorized/public-domain/licensed/internal/owned catalogs. This package does not include adapters for unauthorized streaming sources or hidden server routing.

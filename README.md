# ARC-SeedCatalog v0.4.0

**ARC-SeedCatalog** is a static, GitHub Pages-ready, Palantir-style ARC-Core split-bundle catalog ingester.

It ingests flexible authorized server/source/catalog JSON, normalizes the rows in volatile browser memory, and exports ARC-safe proof bundles without storing raw titles, server names, URLs, paths, media, descriptions, posters, or user data.

## v0.4.0 capability

- Static GitHub Pages app
- No backend
- No database
- No build step
- File upload and paste input
- Flexible JSON shape detection
- Canonical servers format
- Sources/catalog format
- Flat rows format
- Wrapped `data` format
- Object-map format
- Adapter report
- Sorting
- Receipt search
- Category/source/epoch counts
- Local bundle integrity verification
- Import/export roundtrip verification
- Receipt bundle export
- Policy bundle export
- Index bundle export
- ARC-Core handoff export
- ARC-Core JSONL registration export
- Arc-RAR manifest export
- OmniBinary hash report export
- Validation bundle export
- Complete docs and schemas

## Split-bundle model

```text
Input JSON
  -> volatile normalization
  -> receipt bundle
  -> policy bundle
  -> index bundle
  -> ARC-Core handoff bundle
  -> ARC-Core JSONL registration export
  -> Arc-RAR manifest
  -> OmniBinary canonical hash report
  -> validation bundle
```

## What is stored

Only opaque references:

- source IDs
- entry IDs
- category vectors
- category path hashes
- ruleset hashes
- receipt hashes
- bundle hashes
- counts and proof metadata

## What is not stored

- titles
- paths
- raw server names
- hostnames
- URLs
- stream links
- descriptions
- posters
- media files
- user data

## Legal boundary

Use only for authorized, public-domain, licensed, internal, owned, homebrew, or synthetic catalogs.

Do not use it to mirror piracy sites, route unauthorized streams, preserve hidden host lists, or bypass access controls.

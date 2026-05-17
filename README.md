# ARC-SeedCatalog v0.5.0

**ARC-SeedCatalog** is a static, GitHub Pages-ready, Palantir-style ARC-Core split-bundle catalog ingester for authorized server/source JSON.

It is designed to ingest flexible catalogs, normalize them in volatile browser memory, and export ARC-safe proof bundles without storing raw titles, URLs, paths, server names, hostnames, descriptions, posters, media, or user data.

## v0.5.0 focus

v0.5 moves the project from a static proof demo into a repo-ready ARC module foundation.

Added:

- adapter profiles
- category remap rules
- UI tab structure
- adapter preview
- category preview
- ARC-Core route stubs
- CLI companion scaffold
- Arc-RAR proof-pack template
- OmniBinary byte/hash docs
- schemas for adapter profiles and category maps
- stronger GitHub Pages/repo docs

## Core architecture

```text
Authorized JSON input
  -> adapter profile / auto-detection
  -> volatile normalization
  -> category remap
  -> HMAC seeded entry IDs
  -> source hashes
  -> category vectors
  -> receipt bundle
  -> policy bundle
  -> index bundle
  -> ARC-Core handoff bundle
  -> ARC-Core JSONL records
  -> Arc-RAR manifest
  -> OmniBinary hash report
  -> validation report
```

## What exported bundles store

- entry IDs
- source IDs
- category vectors
- category path hashes
- receipt hashes
- bundle hashes
- policy metadata
- counts
- ARC-Core registration records

## What exported bundles do not store

- raw titles
- raw paths
- raw URLs
- raw server names
- hostnames
- descriptions
- posters
- media files
- user data
- raw input JSON

## Use cases

- authorized media catalog indexing
- public-domain catalog categorization
- internal asset library proof
- homebrew/game catalog indexing
- dataset catalog proof
- ARC-Core authority registration
- Arc-RAR portable proof bundles
- OmniBinary hash verification

## Run

Open:

```text
index.html
```

or deploy to GitHub Pages.

## CLI scaffold

```bash
python cli/arc_seedcatalog/cli.py ingest examples/catalogs/canonical_servers.example.json --seed local-dev --epoch 2026-05-16
```

The CLI scaffold mirrors the browser proof flow for future terminal automation.

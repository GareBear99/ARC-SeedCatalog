# Architecture

ARC-SeedCatalog v0.3 uses a Palantir-style split-bundle approach.

## Bundle flow

```text
Flexible JSON input
  -> volatile normalization
  -> receipt bundle
  -> policy bundle
  -> index bundle
  -> ARC-Core handoff bundle
  -> Arc-RAR export bundle
  -> OmniBinary bundle
  -> validation bundle
```

## ARC-Core role

ARC-Core should ingest only the `arc_core_handoff_bundle` or the full split bundle. It should not ingest raw source/catalog JSON.

## Arc-RAR role

Arc-RAR should package exported proof bundles for portable archive/rollback without raw catalog contents.

## OmniBinary role

OmniBinary defines byte-stable canonicalization and hash discipline for every exported bundle.

## Resolver rule

Raw resolver maps can exist only in volatile browser memory while deriving receipts. They are intentionally not exported.

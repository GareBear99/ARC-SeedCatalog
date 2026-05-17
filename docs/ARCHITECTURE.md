# Palantir-Style ARC-Core Split Bundle Architecture

ARC-SeedCatalog v0.2.0 splits output into bundles instead of one mixed blob.

## Bundle map

```text
receipt_bundle
  Opaque source IDs, entry IDs, category vectors, receipt hashes.

policy_bundle
  Rules and explicit disallowed storage fields.

normalize_bundle
  Proof that normalization happened in volatile memory only.

arc_core_handoff_bundle
  Safe payload for ARC-Core authority registration.

arc_rar_export_bundle
  Portable proof/export plan.

omnibinary_bundle
  Canonical byte/hash discipline for deterministic verification.
```

## Why this solves the single-source-of-truth problem

ARC-Core does not need raw catalog data. It needs authority-safe receipts.

The static page can ingest broad JSON shapes, normalize them in temporary browser memory, discard raw fields, and export only the receipt bundles.

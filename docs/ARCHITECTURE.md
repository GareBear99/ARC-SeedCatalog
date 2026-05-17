# ARC-SeedCatalog v0.4 Architecture

ARC-SeedCatalog v0.4 is a static split-bundle catalog ingester.

## Flow

```text
Authorized JSON input
  -> shape detection
  -> volatile normalization
  -> HMAC seeded entry derivation
  -> source hash derivation
  -> category vector derivation
  -> receipt bundle
  -> policy bundle
  -> index bundle
  -> ARC-Core handoff bundle
  -> ARC-Core JSONL export
  -> Arc-RAR manifest
  -> OmniBinary hash report
  -> local verification report
```

## Palantir-style split bundle

Instead of one mixed database, v0.4 separates responsibility:

- Receipt bundle: opaque entry records.
- Policy bundle: rules and denied raw fields.
- Adapter report: detected shape and row/source count.
- Normalize bundle: proof that raw input was volatile.
- Index bundle: counts/search-safe metadata.
- ARC-Core handoff: authority-safe registration payload.
- Arc-RAR manifest: portable proof bundle plan.
- OmniBinary report: canonical byte/hash discipline.
- Validation bundle: safety/integrity check summary.

## Zero raw-data doctrine

Input can contain raw fields, but exported bundles must not retain them.

# OmniBinary Hash Report

The `omnibinary_bundle` records canonicalization and hash discipline.

```text
canonical JSON = sorted-key JSON to UTF-8 bytes
hash = SHA-256
entry derivation = HMAC-SHA-256
```

This makes exported bundles deterministic and verifiable.

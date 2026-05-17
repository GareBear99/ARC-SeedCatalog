# OmniBinary Discipline

Canonicalization:

```text
sorted-key JSON -> UTF-8 bytes -> SHA-256
```

Entry derivation:

```text
HMAC-SHA-256(seed, source_id + volatile_fingerprint)
```

This makes receipts deterministic without storing raw fields.

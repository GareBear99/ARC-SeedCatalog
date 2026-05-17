# Architecture

ARC-SeedCatalog v0.5 is organized around split bundles.

```text
Input JSON
  -> adapter profile
  -> category map
  -> volatile normalization
  -> receipt bundle
  -> policy bundle
  -> index bundle
  -> ARC-Core handoff
  -> Arc-RAR proof pack
  -> OmniBinary hash report
```

The static UI and CLI scaffold share the same doctrine: raw fields may enter as volatile input, but exported proof artifacts must not store them.

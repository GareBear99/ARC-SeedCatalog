# ARC-Core Handoff

Use:

```text
arc_core_handoff_bundle
```

or:

```text
arc-core-seedcatalog-records-v0.5.jsonl
```

ARC-Core should store only:

- receipt_hash
- entry_id
- source_id
- category_vector
- category_path_hash
- ruleset_hash
- category_map_hash
- adapter_profile_hash
- policy status

ARC-Core should never store raw titles, paths, URLs, server names, hostnames, media, or user data.

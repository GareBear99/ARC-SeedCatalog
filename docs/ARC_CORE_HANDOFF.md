# ARC-Core Handoff

Use either:

```text
arc_core_handoff_bundle
```

or:

```text
arc-core-seedcatalog-records-v0.4.jsonl
```

Suggested route:

```text
POST /seedcatalog/register-bundle
```

Each JSONL record includes:

- receipt hash
- entry id
- source id
- category vector
- category path hash
- ruleset hash
- no-raw-data policy flag

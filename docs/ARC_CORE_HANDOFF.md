# ARC-Core Handoff

The safe payload is:

```text
arc_core_handoff_bundle
```

It contains:

- receipt bundle hash
- policy bundle hash
- index bundle hash
- ruleset hash
- source count
- entry count
- authority policy

It does not contain raw titles, paths, URLs, server names, hostnames, media, or user data.

Suggested route:

```text
POST /seedcatalog/register-bundle
```

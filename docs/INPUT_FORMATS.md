# Input Formats

v0.4 accepts:

- `{ "servers": [...] }`
- `{ "sources": [...] }`
- `{ "data": [...] }`
- `{ "items": [...] }`
- flat arrays
- object maps
- single row objects

The normalizer searches for common fields like:

```text
path, url, href, title, name, id, category, genre, type
```

Those fields can influence HMAC derivation, but they are not exported.

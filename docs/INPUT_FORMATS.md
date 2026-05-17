# Input Formats

Supported JSON shapes:

## Canonical servers

```json
{
  "servers": [
    {
      "server_id": "node",
      "server_type": "authorized_catalog",
      "items": [
        {"path": "/x", "category": "media/movie/public-domain"}
      ]
    }
  ]
}
```

## Sources

```json
{
  "sources": [
    {
      "name": "node",
      "catalog": [
        {"id": "x", "category": "media/public-domain/archive"}
      ]
    }
  ]
}
```

## Flat rows

```json
[
  {"server": "node", "path": "/x", "category": "media/movie/public-domain"}
]
```

## Wrapped data

```json
{
  "data": [
    {"source": "node", "url": "volatile-only", "category": "media/movie/licensed/action"}
  ]
}
```

## Object map

```json
{
  "node": [
    {"path": "/x", "category": "media/movie/public-domain"}
  ]
}
```

Raw fields can be present in input, but exported output stores only opaque hashes and receipts.

# Input Formats

ARC-SeedCatalog accepts multiple JSON shapes.

## Canonical servers

```json
{"servers":[{"server_id":"node","items":[{"path":"/x","category":"media/movie/public-domain"}]}]}
```

## Flat rows

```json
[{"server":"node","path":"/x","category":"media/movie/public-domain"}]
```

## Wrapped data

```json
{"data":[{"server":"node","path":"/x","category":"media/movie/public-domain"}]}
```

## Object map

```json
{"node":[{"path":"/x","category":"media/movie/public-domain"}]}
```

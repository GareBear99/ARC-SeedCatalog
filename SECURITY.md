# Security Policy

ARC-SeedCatalog treats all input JSON as untrusted.

## Security rules

- Do not execute input JSON.
- Do not fetch remote URLs from input.
- Do not export raw fields.
- Treat seeds as secrets.
- Do not commit production seeds.
- Use SHA-256 for bundle hashes.
- Use HMAC-SHA-256 for seeded entry IDs.
- Run `audit-leaks` before publishing proof bundles.
- Use deterministic replay when reproducing releases.

## Current signing status

v0.9 includes a signing-ready envelope. Real Ed25519 signatures are intentionally deferred to v1.0 instead of being faked.

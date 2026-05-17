# Security Policy

- Treat all input JSON as untrusted.
- Do not execute input JSON.
- Do not fetch URLs from input.
- Do not export raw fields.
- Treat seeds as secrets.
- Do not commit production seeds.
- Use SHA-256 for bundle hashes.
- Use HMAC-SHA-256 for seeded entry IDs.

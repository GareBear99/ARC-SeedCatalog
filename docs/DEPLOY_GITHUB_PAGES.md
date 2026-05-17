# Deploy to GitHub Pages

```bash
git init
git add .
git commit -m "Initial ARC-SeedCatalog split-bundle static demo"
gh repo create ARC-SeedCatalog --public --source=. --remote=origin --push
```

Then enable Pages:

```bash
gh api repos/GareBear99/ARC-SeedCatalog/pages \
  -X POST \
  -f build_type=workflow
```

The included workflow deploys the static root.

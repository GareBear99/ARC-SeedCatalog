# Deploy to GitHub Pages

```bash
git init
git add .
git commit -m "Initial ARC-SeedCatalog v0.4 static split-bundle app"
gh repo create ARC-SeedCatalog --public --source=. --remote=origin --push
```

Then enable Pages with GitHub Actions:

```bash
gh api repos/GareBear99/ARC-SeedCatalog/pages \
  -X POST \
  -f build_type=workflow
```

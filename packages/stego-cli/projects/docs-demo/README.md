# Stego Documentation Demo

A nonfiction and business-style demo project.

This project intentionally keeps config minimal while documenting the full Stego feature set.

- no `bibleCategories` in this project's `project.json`
- no Story Bible continuity enforcement in this demo project
- manuscripts include documentation of fiction and Story Bible capabilities
- metadata remains lightweight (`status` plus optional chapter grouping)

Use this demo when you want to show Stego as documentation workflow infrastructure while still explaining fiction workflows.

Run from `/Users/mattgold/Code/stego`:

```bash
npm run validate -- --project docs-demo
npm run build -- --project docs-demo
npm run export -- --project docs-demo --format md
```

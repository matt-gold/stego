# The Fidelity Problem (Demo)

A minimal-configuration demo. No bible categories, no continuity tracking — just manuscript files, a build pipeline, and freeform notes for reference.

- four manuscript files with lightweight metadata (`status` and `chapter` only)
- no `bibleCategories` configured; category-based validation is disabled
- `notes/` is used for freeform world-building notes, not formal entity tracking
- demonstrates the simplest possible stego workflow: write, validate, build, export

Run from `/Users/mattgold/Code/stego`:

```bash
npm run validate -- --project mirror-demo
npm run build -- --project mirror-demo
npm run export -- --project mirror-demo --format md
```

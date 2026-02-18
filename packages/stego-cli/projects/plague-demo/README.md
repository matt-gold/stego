# Under Saturn's Breath (Demo)

This project is intentionally short but structured to demonstrate conventions and tooling:

- four manuscript files in `manuscript/` with concise metadata
- sequencing is filename-based using sparse three-digit prefixes (`100`, `200`, `300`, ...)
- chapter breaks inferred from `chapter` transitions (`1,1,2,2`)
- literary historical prose sample with social and doctrinal tension
- continuity IDs in metadata using category keys (`characters`, `locations`, `objects`)
- story bible source files in `notes/`

Run from `/Users/mattgold/Code/writing`:

```bash
npm run validate -- --project plague-demo
npm run build -- --project plague-demo
npm run graph -- --project plague-demo
npm run check-stage -- --project plague-demo --stage revise
npm run export -- --project plague-demo --format md
```

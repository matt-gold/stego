# Under Saturn's Breath (Demo)

A full-configuration demo with rich metadata, three spine categories, cross-linked spine entries, and external reference links.

- four manuscript files with full metadata (`status`, `chapter`, `pov`, `timeline`, plus category arrays)
- three spine categories: `characters`, `locations`, `sources`
- spine category files now live in `spine/` (regular notes stay in `notes/`)
- spine entries cross-link between files (characters reference sources they use, locations reference the characters and sources tied to them)
- `sources` category tracks intellectual traditions rather than physical objects, with Wikipedia links to historical references
- demonstrates the full range of stego's continuity tracking and metadata validation

Run from `/Users/mattgold/Code/stego`:

```bash
npm run validate -- --project plague-demo
npm run build -- --project plague-demo
npm run check-stage -- --project plague-demo --stage draft
npm run export -- --project plague-demo --format md
```

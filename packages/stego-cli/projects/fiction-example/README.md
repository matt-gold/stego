# Under Saturn's Breath (Fiction Example)

A full-configuration demo built on the leaf model.

It demonstrates:

- ordered chapter leaves under `content/manuscript/`
- this example stores reference leaves under `content/reference/`
- rich metadata (`status`, `chapter`, `pov`, `timeline`)
- inline cross-references through leaf ids such as `SRC-GALEN`
- template-driven frontmatter, body structure, and backmatter

Run from `/Users/mattgold/Code/stego`:

```bash
npm run validate -- --project fiction-example
npm run build -- --project fiction-example
npm run check-stage -- --project fiction-example --stage draft
npm run export -- --project fiction-example --format md
npm run content:read -- --project fiction-example --format json
```

---
"stego-cli": minor
"stego-extension": minor
---

Migrate Spine to the V2 directory-inferred model and align CLI/extension workflows around CLI-owned mutations.

For `stego-cli`:

- add `stego spine read`, `stego spine new-category`, and `stego spine new --filename`
- add universal `stego metadata read|apply` commands for markdown frontmatter files
- enforce hard cutover away from legacy `spineCategories` runtime config
- update validation to resolve spine categories and entries from `spine/<category>/` directories and per-entry files
- add JSON output support for `stego new` and `stego new-project`
- add `--prose-font yes|no|prompt` to `stego new-project`

For `stego-extension`:

- route metadata document writes through `stego metadata apply` via a new CLI client
- update new project workflow to pass `--prose-font` directly to CLI
- remove local manuscript scaffold-mutation fallback and rely on CLI output
- update sidebar category creation flow to invoke `stego spine new-category`
- infer categories from spine directory structure and flag legacy `spineCategories` config usage

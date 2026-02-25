---
"stego-cli": patch
---

Split markdownlint defaults for manuscripts vs general project markdown by adding a manuscript-specific config (`.markdownlint.manuscript.json`) and using it for manuscript stage checks, while keeping stricter heading rules (including MD041) in the general config for spine/notes/docs. Add `stego lint` for project-wide markdownlint runs, with `--manuscript` and `--spine` scope filters.

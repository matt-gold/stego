# Stego

This workspace is a Markdown-first creative writing pipeline for short stories through novels.

## What this includes

- Project-per-folder structure inside one monorepo.
- Flexible manuscript files with per-project metadata requirements.
- Configurable manuscript grouping via `compileStructure.levels` (for example `part` + `chapter`).
- Project-defined spine categories (configured in each `stego-project.json`).
- Deterministic build into one manuscript Markdown file.
- Stage-based quality gates (`draft` -> `final`).
- Export abstraction (`md` always, `docx`/`pdf` via optional `pandoc`).
- TypeScript-based tooling executed directly by Node (`--experimental-strip-types`).

## Quick start

```bash
cd ~/Code/stego
npm run list-projects
npm run new-project -- --project my-new-project --title "My New Project"
npm run validate -- --project plague-demo
npm run build -- --project plague-demo
npm run check-stage -- --project plague-demo --stage revise
npm run export -- --project plague-demo --format md
```

`npm run new-project` scaffolds `manuscript/`, `spine/`, `notes/`, and `dist/`, and seeds `stego-project.json` with a default `characters` category plus `spine/characters.md`.
It also creates `projects/<project-id>/.vscode/settings.json` so markdown font settings apply when opening the project folder directly.
It also creates a project-local `package.json` so you can run `npm run validate`, `npm run build`, etc. from inside that project directory without `--project`.

## Export requirements (DOCX/PDF)

`docx` and `pdf` export require `pandoc` on your system `PATH`.

Install:

```bash
# macOS (Homebrew)
brew install pandoc
```

```bash
# Ubuntu/Debian
sudo apt-get update && sudo apt-get install -y pandoc
```

```bash
# Windows (winget)
winget install --id JohnMacFarlane.Pandoc -e
```

Verify:

```bash
pandoc --version
```

Then run:

```bash
npm run export -- --project plague-demo --format docx
npm run export -- --project plague-demo --format pdf
```

## Project layout

- `projects/<project-id>/manuscript/` source manuscript files
- `projects/<project-id>/spine/` canonical spine category files (`spineCategories[*].notesFile`)
- `projects/<project-id>/notes/` regular notes and planning docs
- `projects/<project-id>/dist/` generated outputs only
- `docs/` workflow and conventions
- `tools/` build, checks, export CLI

## Project spine categories

Spine categories are not fixed. Each project can declare them in `stego-project.json` under `spineCategories`.

Example:

```json
{
  "spineCategories": [
    { "key": "cast", "prefix": "CHAR", "notesFile": "characters.md" },
    { "key": "places", "prefix": "LOC", "notesFile": "locations.md" },
    { "key": "incidents", "prefix": "EVENT", "notesFile": "timeline.md" },
    { "key": "ordinances", "prefix": "STATUTE", "notesFile": "ordinances.md" }
  ]
}
```

Use those keys as metadata arrays in manuscript files (for example `cast`, `places`, `incidents`, `ordinances`).
Each `notesFile` is a filename resolved in `spine/` (for example `spine/characters.md`).

If `spineCategories` is omitted or empty, category-based continuity validation is disabled.

## Project metadata requirements

Base config defaults to `status`.

Each project can override required keys in `stego-project.json`:

```json
{
  "requiredMetadata": ["status", "chapter", "pov", "timeline"]
}
```

These keys are advisory and reported as warnings when missing; they do not block validate/build/export.
Files may omit metadata entirely.

## Compile structure (grouped manuscript output)

Build grouping is configured per project with `compileStructure.levels`.

Example:

```json
{
  "compileStructure": {
    "levels": [
      {
        "key": "part",
        "label": "Part",
        "titleKey": "part_title",
        "injectHeading": true,
        "headingTemplate": "{label} {value}: {title}",
        "pageBreak": "between-groups"
      },
      {
        "key": "chapter",
        "label": "Chapter",
        "titleKey": "chapter_title",
        "injectHeading": true,
        "headingTemplate": "{label} {value}: {title}",
        "pageBreak": "between-groups"
      }
    ]
  }
}
```

Notes:

- `pageBreak` currently supports `none` or `between-groups`.
- TOC entries are nested by level depth.
- Missing group key/title values inherit from the previous manuscript file, so you only need to set metadata at structural boundaries.
- `validate` reports configuration errors for invalid `compileStructure` entries.

## Included examples

- `plague-demo`: full configuration — rich metadata (`pov`, `timeline`), three spine categories (`characters`, `locations`, `sources`), cross-linked spine with Wikipedia reference links
- `docs-demo`: nonfiction documentation configuration — no spine categories, freeform notes only, primarily `status` metadata

## Placeholder edit workflow (`{{...}}` + Cmd+I)

This repo includes Copilot instruction files to keep placeholder edits scoped:

- `.github/copilot-instructions.md`
- `.github/instructions/placeholder-fill.instructions.md`

Placeholder convention:

- Write draft placeholders as `{{...}}` in manuscript prose.
- Select the placeholder text and run Cmd+I.
- Use short prompts like `fill placeholder` or `replace only inside {{}}`.

Expected behavior:

- Replace only the content inside braces.
- Preserve surrounding sentence/paragraph text.

## Next Steps

- Add Mermaid graphs of metadata (entity relationships, co-occurrence, chapter sequence).

## VS Code tasks

Tasks are defined in `.vscode/tasks.json` for validate/build/stage-check/export.

# Stego CLI

Give your manuscript plot armor.

`stego-cli` turns VS Code into a stage-aware writing environment with Git-backed drafts, structured “spine” knowledge, and workflow validation built for long-form projects.

This repository is the source for the CLI and the example/template content that `stego init` scaffolds into a new workspace.

## What this includes

- Installable CLI (`stego`) for creating and operating Stego workspaces
- Project-per-folder structure inside one monorepo.
- Flexible manuscript files with per-project metadata requirements.
- Configurable manuscript grouping via `compileStructure.levels` (for example `part` + `chapter`).
- Project-defined spine categories (configured in each `stego-project.json`).
- Deterministic build into one manuscript Markdown file.
- Stage-based quality gates (`draft` -> `final`).
- Export abstraction (`md` always, `docx`/`pdf` via optional `pandoc`).
- Example/demo projects (`docs-demo`, `plague-demo`) included in `stego init`.

## Getting started (from npm)

```bash
npm install -g stego-cli

mkdir my-stego-workspace
cd my-stego-workspace
stego init

npm install
npm run list-projects
npm run validate -- --project plague-demo
npm run build -- --project plague-demo
npm run check-stage -- --project plague-demo --stage revise
npm run export -- --project plague-demo --format md
```

`stego init` scaffolds a new workspace in the current directory (it must be empty unless you pass `--force`).

Create another project in the workspace:

```bash
stego new-project --project my-new-project --title "My New Project"
```

`stego new-project` scaffolds `manuscript/`, `spine/`, `notes/`, and `dist/`, seeds `stego-project.json`, creates a project-local `package.json`, and writes `.vscode/extensions.json` recommendations (Stego + Saurus) for that project.

## Running commands for a specific project

From the workspace root, target a project with `--project`:

```bash
npm run validate -- --project plague-demo
npm run build -- --project plague-demo
npm run check-stage -- --project plague-demo --stage proof
npm run export -- --project plague-demo --format md
```

Each project also has local scripts, so you can work from inside the project directory:

```bash
cd projects/plague-demo
npm run validate
npm run build
npm run check-stage -- --stage proof
npm run export -- --format md
```

## VS Code workflow

When you are actively working on one project, open that project directory directly in VS Code (for example `projects/plague-demo`) rather than the whole workspace.

This keeps editor context focused and applies the project's recommended extensions via `projects/<project-id>/.vscode/extensions.json`.

## Developing `stego-cli` (this repo)

If you are working on the CLI itself (this repository), use the local development scripts:

```bash
npm install
npm run list-projects
npm run validate -- --project docs-demo
npm run build -- --project plague-demo
npm run test:compile-structure
npm run build:cli
npm run pack:dry-run
```

These source-repo scripts run the TypeScript CLI directly with Node (`--experimental-strip-types`) for local development.

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

## Scaffolded workspace layout

- `projects/<project-id>/manuscript/` source manuscript files
- `projects/<project-id>/spine/` canonical spine category files (`spineCategories[*].notesFile`)
- `projects/<project-id>/notes/` regular notes and planning docs
- `projects/<project-id>/dist/` generated outputs only
- `stego.config.json` workspace configuration
- `docs/` workflow and conventions
- `.vscode/tasks.json` root VS Code tasks for common Stego commands

## This repo layout (`stego-cli` source)

- `tools/` CLI source code and exporters
- `projects/` template/demo projects bundled by `stego init`
- `docs/` user-facing docs copied into scaffolded workspaces
- `.github/workflows/` CI + Changesets release automation

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

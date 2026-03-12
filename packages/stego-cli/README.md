# Stego CLI

`@stego/cli` is an installable CLI for the Stego writing workflow.

It scaffolds a Stego workspace, validates manuscript structure and metadata, runs stage-aware quality gates, builds compiled markdown outputs, and exports release formats.

It also includes an experimental template-driven compile path through `stego template ...`, powered by `@stego/engine`.

This repository is the source for the CLI and the template/example projects that `stego init` scaffolds.

## Quick start (install + init)

```bash
npm install -g @stego/cli

mkdir my-stego-workspace
cd my-stego-workspace
stego init
npm install

stego list-projects
stego validate -p fiction-example
stego build -p fiction-example
stego new -p fiction-example
stego template build -p fiction-example
```

`stego init` scaffolds two example projects:

- `stego-docs` (the full documentation project)
- `fiction-example` (a fiction-oriented demo with rich Spine usage)

For day-to-day editing, open a project folder in VS Code (for example `projects/stego-docs`) and use the [Stego VS Code extension](https://github.com/matt-gold/stego/tree/main/packages/stego-extension), which is the official UI for Stego projects.

## Full documentation

The full user documentation lives in the `stego-docs` project.

- In a scaffolded workspace: `projects/stego-docs`
- In this source repo: `projects/stego-docs`

Start by reading the manuscript files in order, or build the docs project:

```bash
stego build --project stego-docs
```

## Architecture

Internal architecture notes for the domain-first module layout live in:

- `docs/architecture.md`

## Core commands

Run commands from the workspace root and target a project with `--project`.

```bash
stego list-projects
stego new-project -p my-book --title "My Book"
stego new -p fiction-example
stego validate -p fiction-example
stego build -p fiction-example
stego check-stage -p fiction-example --stage revise
stego export -p fiction-example --format md
stego spine read -p fiction-example
stego spine new-category -p fiction-example --key characters
stego spine new -p fiction-example --category characters --filename supporting/abigail
stego metadata read projects/fiction-example/manuscript/100-the-commission.md --format json
```

All project-scoped commands accept `-p` as shorthand for `--project`.

`stego new` also supports `--i <prefix>` for numeric prefix override and `--filename <name>` for an explicit manuscript filename.

## Experimental template engine

Stego now includes a parallel, experimental template path for TSX-based book templates. This does not replace the existing `build` / `export` flow yet.

Templates live at:

- `projects/<project-id>/templates/book.template.tsx`

Current experimental commands:

```bash
stego template build -p fiction-example
stego template export -p fiction-example --format pdf
stego template export -p fiction-example --format docx
```

Current behavior:

- templates are plain TSX using normal JavaScript control flow
- templates import `defineTemplate` and `Stego` from `@stego/engine`
- the engine compiles project content into Stego IR and lowers it into a Pandoc-oriented render plan
- template export supports `md`, `docx`, `pdf`, and `epub`
- `dist/<project-id>.template.md` and `dist/<project-id>.template.render-plan.json` are written for inspection during `template build`

Spine V2 is directory-inferred:

- categories are directories in `spine/<category>/`
- category metadata lives at `spine/<category>/_category.md`
- entries are markdown files in each category directory tree

## Image assets and manuscript image settings

Stego projects scaffold an `assets/` directory for manuscript images.

Use standard Markdown image syntax in manuscript files:

```md
![Map](../assets/maps/city-plan.png)
```

Set global image defaults in `stego-project.json`:

```json
{
  "images": {
    "layout": "block",
    "align": "center",
    "width": "50%",
    "classes": ["illustration"]
  }
}
```

Use manuscript frontmatter `images` only for per-path overrides:

```yaml
images:
  assets/maps/city-plan.png:
    layout: inline
    align: left
    width: 100%
    classes: [diagram]
```

Rules:

- project-level global keys in `stego-project.json images`: `width`, `height`, `classes`, `id`, `attrs`, `layout`, `align`
- manuscript frontmatter `images` keys are per-image overrides by project-relative asset path
- manuscript frontmatter should not define global keys; put defaults in `stego-project.json`
- `layout` (`block|inline`) and `align` (`left|center|right`) are emitted as image attrs (`data-layout`, `data-align`) in compiled markdown
- EPUB export includes a default image layout stylesheet (`filters/image-layout.css`) for `data-layout`/`data-align` behavior
- inline image attrs in markdown win over both project defaults and frontmatter overrides
- local manuscript image targets outside `assets/` are reported as validate warnings

Projects also include local npm scripts so you can work from inside a project directory.

## Complete CLI command reference

The full command surface is available via:

```bash
stego --help
stego --version
```

Current `stego --help` command index:

```text
init [--force]
list-projects [--root <path>]
new-project --project|-p <project-id> [--title <title>] [--prose-font <yes|no|prompt>] [--format <text|json>] [--root <path>]
new --project|-p <project-id> [--i <prefix>|-i <prefix>] [--filename <name>] [--format <text|json>] [--root <path>]
validate --project|-p <project-id> [--file <project-relative-manuscript-path>] [--root <path>]
build --project|-p <project-id> [--root <path>]
check-stage --project|-p <project-id> --stage <draft|revise|line-edit|proof|final> [--file <project-relative-manuscript-path>] [--root <path>]
lint --project|-p <project-id> [--manuscript|--spine] [--root <path>]
export --project|-p <project-id> --format <md|docx|pdf|epub> [--output <path>] [--root <path>]
template build --project|-p <project-id> [--template <path>] [--root <path>]
template export --project|-p <project-id> --format <md|docx|pdf|epub> [--template <path>] [--output <path>] [--root <path>]
spine read --project|-p <project-id> [--format <text|json>] [--root <path>]
spine new-category --project|-p <project-id> --key <category> [--label <label>] [--require-metadata] [--format <text|json>] [--root <path>]
spine new --project|-p <project-id> --category <category> [--filename <relative-path>] [--format <text|json>] [--root <path>]
metadata read <markdown-path> [--format <text|json>]
metadata apply <markdown-path> --input <path|-> [--format <text|json>]
comments read <manuscript> [--format <text|json>]
comments add <manuscript> [--message <text> | --input <path|->] [--author <name>] [--start-line <n> --start-col <n> --end-line <n> --end-col <n>] [--cursor-line <n>] [--format <text|json>]
comments reply <manuscript> --comment-id <CMT-####> [--message <text> | --input <path|->] [--author <name>] [--format <text|json>]
comments set-status <manuscript> --comment-id <CMT-####> --status <open|resolved> [--thread] [--format <text|json>]
comments delete <manuscript> --comment-id <CMT-####> [--format <text|json>]
comments clear-resolved <manuscript> [--format <text|json>]
comments sync-anchors <manuscript> --input <path|-> [--format <text|json>]
```

## Advanced integration command

`stego comments add` is a machine-facing command for editor/tool integrations.

```bash
stego comments add manuscript/100-scene.md --message "Could this transition be clearer?"
stego comments add manuscript/100-scene.md --input payload.json --format json
stego comments add manuscript/100-scene.md --input - --format json <<'JSON'
{"message":"Could this transition be clearer?","range":{"start":{"line":10,"col":4},"end":{"line":10,"col":32}}}
JSON
```

## VS Code workflow

When actively working on one project, open that project directory directly in VS Code (for example `projects/fiction-example`).

The Stego VS Code extension is the official UI for Stego projects, and opening a single project keeps its UI context and Spine Browser focused. Project folders also include extension recommendations.

## Develop `@stego/cli` (this repo)

```bash
npm install
npm run list-projects
npm run validate -- --project stego-docs
npm run build -- --project fiction-example
npm run test
npm run build:cli
npm run pack:dry-run
```

## Export requirements (`docx`, `pdf`, `epub`)

These formats require `pandoc` on your `PATH`.

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

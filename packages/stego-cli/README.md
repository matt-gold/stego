# Stego CLI

`@stego-labs/cli` is the installable CLI for the Stego writing workflow.

It scaffolds a Stego workspace, validates leaf structure and metadata, runs stage-aware quality gates, builds compiled manuscripts, and exports delivery formats.

Builds are template-driven through `templates/`, powered by `@stego-labs/engine`. New projects still start with `templates/book.template.tsx`.

## Quick start

```bash
npm install -g @stego-labs/cli

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
- `fiction-example` (a fiction-oriented demo using chapter and reference leaves)

## Core model

- `content/` holds authored leaves
- scaffolded draft leaves live under `content/manuscript/`
- directories under `content/` are exposed as branches through `_branch.md`
- branch `_branch.md` files declare inheritable `leafPolicy` rules for leaves in that branch subtree
- templates read the root tree through `ctx.content`, the flat leaf list through `ctx.allLeaves`, and the flat branch list through `ctx.allBranches`
- templates compile them into a manuscript
- `dist/` contains generated outputs only

## Core commands

```bash
stego list-projects
stego new-project -p my-book --title "My Book"
stego new -p fiction-example --id CH-INTRO
stego content read -p fiction-example --format json
stego validate -p fiction-example
stego build -p fiction-example
stego check-stage -p fiction-example --stage revise
stego export -p fiction-example --format md
stego metadata read projects/fiction-example/content/manuscript/100-the-commission.md --format json
```

`stego new` supports `--dir <content-relative-dir>` for the target branch directory, `--i <prefix>` for an optional numeric prefix override, `--filename <name>` for an explicit filename, and `--id <leaf-id>` for an explicit leaf id.

## Template engine

Stego has two template lanes:

- Default lane: one simple `templates/book.template.tsx` using the broad `Stego` API
- Advanced template mode: multiple templates per project, auto-discovered from `templates/*.template.tsx`, with target-aware declarations and a narrowed Stego API

Templates live in `projects/<project-id>/templates/`. New projects still scaffold only `templates/book.template.tsx`.

```bash
stego template build -p fiction-example
stego template export -p fiction-example --format pdf
stego template export -p fiction-example --format docx
```

Current behavior:

- templates are plain TSX using normal JavaScript control flow
- templates import `defineTemplate` and `Stego` from `@stego-labs/engine`
- the engine loads ordered leaves from `content/`
- default projects can stay on `defineTemplate((ctx) => ...)` and export to `md`, `docx`, `pdf`, and `epub` without extra configuration
- advanced template mode is opt-in: `defineTemplate({ targets: [...] }, (ctx: TemplateContext<...>, Stego) => ...)` narrows the Stego API to the strict intersection of those presentation targets
- advanced template mode supports multiple templates per project through auto-discovery in `templates/`
- template export supports `md`, `docx`, `pdf`, and `epub`
- `md` is the low-fidelity compiled/debug artifact: useful for inspection, diffing, and portable handoff, but not a full presentation-fidelity target for all Stego layout primitives
- `md` is a special-case export artifact: it stays on the deterministic default template path unless you explicitly bypass it with `--template`
- `docx`, `pdf`, and `epub` are the presentation targets when you need richer layout fidelity
- `dist/<project-id>.template.md` and `dist/<project-id>.template.render-plan.json` are written for inspection during `template build`

### Default vs advanced templates

Default projects keep the low-friction path:

- `stego build` compiles the default `book.template.tsx`
- `stego export --format md|docx|pdf|epub|latex` uses that same default template

Advanced template mode is for sophisticated projects that want target-aware templates, multiple templates per project, or a narrowed Stego API:

- Stego auto-discovers `templates/*.template.tsx`
- `stego build` compiles every discovered template once and writes per-template markdown/render-plan artifacts
- `stego export --format docx|pdf|epub|latex` chooses the unique matching discovered template
- if more than one discovered template supports the same presentation target, export fails with an ambiguity error until you pass `--template`
- `stego template build` and `stego template export` remain the direct single-template debug/bypass commands

## Images

Stego projects scaffold an `assets/` directory for local images.

Use standard Markdown image syntax in leaf files:

```md
![Map](../assets/maps/city-plan.png)
```

Set project-level image defaults in `stego-project.json`:

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

Leaf frontmatter `images` only supports per-path overrides.

## Command reference

Use:

```bash
stego --help
stego --version
```

Notable commands:

```text
init [--force]
list-projects [--root <path>]
new-project --project|-p <project-id> [--title <title>] [--prose-font <yes|no|prompt>] [--format <text|json>] [--root <path>]
new --project|-p <project-id> [--i <prefix>|-i <prefix>] [--filename <name>] [--id <leaf-id>] [--format <text|json>] [--root <path>]
content read --project|-p <project-id> [--format <text|json>] [--root <path>]
validate --project|-p <project-id> [--file <project-relative-content-path>] [--root <path>]
build --project|-p <project-id> [--template <path>] [--root <path>]
check-stage --project|-p <project-id> --stage <draft|revise|line-edit|proof|final> [--file <project-relative-content-path>] [--root <path>]
lint --project|-p <project-id> [--manuscript|--notes] [--root <path>]
export --project|-p <project-id> --format <md|docx|pdf|epub|latex> [--template <path>] [--output <path>] [--root <path>]
template build --project|-p <project-id> [--template <path>] [--root <path>]
template export --project|-p <project-id> --format <md|docx|pdf|epub|latex> [--template <path>] [--output <path>] [--root <path>]
metadata read <markdown-path> [--format <text|json>]
metadata apply <markdown-path> --input <path|-> [--format <text|json>]
comments read <markdown-path> [--format <text|json>]
comments add <markdown-path> [--message <text> | --input <path|->] [--author <name>] [--start-line <n> --start-col <n> --end-line <n> --end-col <n>] [--cursor-line <n>] [--format <text|json>]
comments reply <markdown-path> --comment-id <CMT-####> [--message <text> | --input <path|->] [--author <name>] [--format <text|json>]
comments set-status <markdown-path> --comment-id <CMT-####> --status <open|resolved> [--thread] [--format <text|json>]
comments delete <markdown-path> --comment-id <CMT-####> [--format <text|json>]
comments clear-resolved <markdown-path> [--format <text|json>]
comments sync-anchors <markdown-path> --input <path|-> [--format <text|json>]
```

## VS Code workflow

Open one project directory at a time in VS Code. The Stego extension is the official UI for Stego projects and is built around the project-local `content/`, metadata, comments, and build flow.

## Develop this repo

```bash
npm install
npm run list-projects
npm run validate -- --project stego-docs
npm run build -- --project fiction-example
npm run test
npm run build:cli
npm run pack:dry-run
```

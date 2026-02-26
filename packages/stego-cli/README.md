# Stego CLI

`stego-cli` is an installable CLI for the Stego writing workflow.

It scaffolds a Stego workspace, validates manuscript structure and metadata, runs stage-aware quality gates, builds compiled markdown outputs, and exports release formats.

This repository is the source for the CLI and the template/example projects that `stego init` scaffolds.

## Quick start (install + init)

```bash
npm install -g stego-cli

mkdir my-stego-workspace
cd my-stego-workspace
stego init
npm install

stego list-projects
stego validate --project fiction-example
stego build --project fiction-example
```

`stego init` scaffolds two example projects:

- `stego-docs` (the full documentation project)
- `fiction-example` (a fiction-oriented demo with rich Spine usage)

For day-to-day editing, open a project folder in VS Code (for example `projects/stego-docs`) and use the [Stego VS Code extension](https://github.com/matt-gold/stego-extension), which is the official UI for Stego projects.

## Full documentation

The full user documentation lives in the `stego-docs` project.

- In a scaffolded workspace: `projects/stego-docs`
- In this source repo: `projects/stego-docs`

Start by reading the manuscript files in order, or build the docs project:

```bash
stego build --project stego-docs
```

## Core commands

Run commands from the workspace root and target a project with `--project`.

```bash
stego list-projects
stego new-project --project my-book --title "My Book"
stego validate --project fiction-example
stego build --project fiction-example
stego check-stage --project fiction-example --stage revise
stego export --project fiction-example --format md
```

Projects also include local npm scripts so you can work from inside a project directory.

## VS Code workflow

When actively working on one project, open that project directory directly in VS Code (for example `projects/fiction-example`).

The Stego VS Code extension is the official UI for Stego projects, and opening a single project keeps its UI context and Spine Browser focused. Project folders also include extension recommendations.

## Develop `stego-cli` (this repo)

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

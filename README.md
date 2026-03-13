# Stego

Stego is a markdown-first writing system for long-form projects.

<div align="center">
  <img src="packages/stego-extension/assets/stego.png" alt="Stego logo" width="128" />
</div>

It combines a CLI workflow (`@stego-labs/cli`) with a VS Code UI (`stego-extension`) so teams can draft, validate, and release manuscripts with structured references and repeatable build pipelines.

## What Stego Is For

- Writing and organizing long-form content in plain markdown.
- Managing structured project context with Spine categories and entries.
- Running stage-aware quality gates and validation checks.
- Building and exporting manuscripts to md, docx, pdf, and epub.
- Working in a Git-friendly, automation-friendly workflow.

## Packages

- [`packages/stego-cli`](packages/stego-cli): CLI engine for init, validation, stage checks, build, lint, and export.
- [`packages/stego-extension`](packages/stego-extension): VS Code extension UI for manuscript, Spine, and comments workflows.

## Full Documentation

For complete docs, start here:

- [`packages/stego-cli/projects/stego-docs/README.md`](packages/stego-cli/projects/stego-docs/README.md)
- [`packages/stego-cli/README.md`](packages/stego-cli/README.md) (includes complete CLI command reference)

## Agent Guidance

- [`AGENTS.md`](AGENTS.md): CLI-first instructions for AI agents operating on Stego projects.

## CLI Commands (High-Level)

- `stego init`: scaffold a new Stego workspace.
- `stego list-projects`: list projects in the workspace.
- `stego new-project`: create a new project scaffold.
- `stego new`: create a new manuscript file in a project.
- `stego validate`: run project/file validation checks.
- `stego check-stage`: run stage-gate checks.
- `stego lint`: run markdown linting (project/manuscript/spine).
- `stego build`: compile manuscript markdown output.
- `stego export`: export to `md`, `docx`, `pdf`, or `epub`.

## Quick Start

 - Create your stego workspace in an empty directory:

```bash
npm install -g @stego-labs/cli
stego init
stego new-project -p hello-world
```

 - Open `./projects/hello-world` in VSCode
 - Install the [stego vscode extension](https://marketplace.visualstudio.com/items?itemName=matt-gold.stego-extension)

## License

Apache-2.0. See [`LICENSE`](LICENSE).

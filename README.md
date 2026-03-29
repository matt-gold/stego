# Stego

Stego turns a manuscript into structured data you can write with, inspect, validate, and transform.

<div align="center">
  <img src="packages/stego-extension/assets/stego.png" alt="Stego logo" width="128" />
</div>

It combines a TSX templating engine with a CLI workflow (`@stego-labs/cli`) and a VS Code UI (`stego-extension`) so authors can draft, validate, analyze, and export long-form projects from structured source files.

## What Stego Is For

- Writing and organizing long-form content in plain markdown and TSX.
- Treating manuscript content as data that templates can transform into multiple outputs.
- Managing reference systems, lore, story bibles, and other non-manuscript content in the same project.
- Running stage-aware quality gates and validation checks.
- Working with teams or AI through a text-anchored comment resolution system.
- Exporting to markdown, docx, pdf, epub, and latex from the same source project.
- Working in a Git-friendly, automation-friendly, AI-friendly environment.

## Core Model

- Authored source lives under `content/` as "leaf" files with frontmatter metadata and body text.
- Directories under `content/` let you organize your files into nested "branches".
- Branch `_branch.md` files define inheritable rules to quickly configure groups of leaf metadata.
- Templates in `templates/` receive the content tree as data, allowing compiled manuscripts, reports, appendices, and other derived outputs to take any shape you need.
- Projects can distinguish between manuscript material and other content such as references, notes, or appendices while keeping everything in the same source tree.

In other words: Stego is not just a formatter. It gives you a structured manuscript model that templates and tools can compute over.

## Packages

- [`packages/stego-engine`](packages/stego-engine): TSX rendering engine and authoring primitives used by Stego templates.
- [`packages/stego-cli`](packages/stego-cli): CLI for init, project scaffolding, new leaves, validation, build, lint, template build, and export.
- [`packages/stego-extension`](packages/stego-extension): VS Code UI for content, metadata, comments, explore, and project workflows.
- [`packages/shared`](packages/shared): shared contracts and domain logic used across the CLI, engine, and extension.

## Full Documentation

For complete docs, start here:

- [`packages/stego-cli/projects/stego-docs/README.md`](packages/stego-cli/projects/stego-docs/README.md)
- [`packages/stego-cli/README.md`](packages/stego-cli/README.md) (includes complete CLI command reference)
- [`packages/stego-extension/README.md`](packages/stego-extension/README.md)

## Agent Guidance

- [`AGENTS.md`](AGENTS.md): CLI-first instructions for AI agents operating on Stego projects. This enables AI workflows like `"Identify problems with my writing by leaving Stego comments in my project."`

## CLI Commands (High-Level)

- `stego init`: scaffold a new Stego workspace.
- `stego list-projects`: list projects in the workspace.
- `stego new-project`: create a new project scaffold.
- `stego new`: create a new leaf in a project content directory.
- `stego content read`: inspect discovered content records for a project.
- `stego metadata read|apply`: read and update frontmatter metadata.
- `stego comments ...`: manage structured inline review comments.
- `stego validate`: run project or file validation checks.
- `stego check-stage`: run stage-gate checks.
- `stego lint`: run markdown and spelling checks.
- `stego build`: compile the default manuscript template path.
- `stego export`: export to `md`, `docx`, `pdf`, `epub`, or `latex`.
- `stego template build|export`: work directly with template files and target-aware template mode.

## Quick Start

- Create a Stego workspace:

```bash
npm install -g @stego-labs/cli

mkdir my-stego-workspace
cd my-stego-workspace

stego init
npm install

stego list-projects
stego validate -p fiction-example
stego build -p fiction-example
```

- `stego init` scaffolds `fiction-example` and `stego-docs`.
- Create your own project with `stego new-project -p hello-world --title "Hello World"`.
- Open a project such as `./projects/fiction-example` or `./projects/hello-world` in VS Code.
- Install the [stego vscode extension](https://marketplace.visualstudio.com/items?itemName=matt-gold.stego-extension)

## Template-Driven Workflow

- Stego templates are plain TSX modules powered by `@stego-labs/engine`.
- The default path is `templates/book.template.tsx`.
- Templates receive tree structure as `ctx.content`, as well as the flattened `ctx.allLeaves` with `ctx.allBranches`.
- Templates can also inspect manuscript text directly with helpers such as `Stego.getText(...)`, `Stego.getWords(...)`, and `Stego.getWordCount(...)`.
- `stego build` and `stego export` use the default template workflow.
- `stego template build` and `stego template export` are the direct template-debug and multi-template commands.

`stego template build` writes two especially useful inspection artifacts:

- compiled markdown
- a backend-document JSON render plan

The markdown is what Pandoc reads. The backend-document JSON carries the richer presentation metadata Stego still needs for filters, export preparation, and postprocessing.

## License

Apache-2.0. See [`LICENSE`](LICENSE).

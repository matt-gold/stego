# Stego

Stego turns JSX into a powerful book-authoring tool.

<div align="center">
  <img src="packages/stego-extension/assets/stego.png" alt="Stego logo" width="128" />
</div>

It combines a TSX templating engine with a CLI workflow (`@stego-labs/cli`) and a VS Code UI (`stego-extension`) so authors can draft, validate, and export long-form projects from structured source files.

## What Stego Is For

- Writing and organizing long-form content in plain markdown and TSX - like a react component for your novel or paper.
- Managing reference systems, lore, story bibles, etc - like a database for your novel or paper.
- Running stage-aware quality gates and validation checks - like lint for your novel or paper.
- Working with teams or AI via a text-anchored comment resolution system.
- Building and exporting a canonical markdown manuscript to docx, pdf, epub, and more.
- Working in a Git-friendly, automation-friendly, AI-friendly environment.

## Core Model

- Authored source lives under `content/` as "leaf" files with frontmatter metadata and body text.
- Directories under `content/` let you organize your files into nested "branches".
- Branch `_branch.md` files define inheritable rules to quickly configure groups of leaf metadata.
- Templates in `templates/` receive the content tree as data, allowing compiled manuscripts to take any shape the author desires.

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
- `stego export`: export to `md`, `docx`, `pdf`, or `epub`.
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
- `stego build` and `stego export` use the default template workflow.
- `stego template build` and `stego template export` are the direct template-debug and multi-template commands.


## License

Apache-2.0. See [`LICENSE`](LICENSE).

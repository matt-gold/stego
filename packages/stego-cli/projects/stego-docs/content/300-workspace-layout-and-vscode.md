---
status: draft
chapter: 3
chapter_title: Workspace Layout and VS Code
concepts:
  - CON-WORKSPACE
  - CON-PROJECT
  - CON-MANUSCRIPT
  - CON-NOTES
  - CON-SPINE
  - CON-DIST
commands:
  - CMD-INIT
  - CMD-NEW-PROJECT
workflows:
  - FLOW-INIT-WORKSPACE
  - FLOW-NEW-PROJECT
integrations:
  - INT-VSCODE
  - INT-STEGO-EXTENSION
  - INT-SAURUS-EXTENSION
  - INT-STEGO-ENGINE
id: DOC-WORKSPACE-LAYOUT-AND-VSCODE
kind: chapter
---

# Workspace Layout and VS Code

## Workspace-level files

At the workspace root you will typically see:

- `stego.config.json` for shared configuration and stage policies
- `projects/` for all writing projects
- `.vscode/tasks.json` for common root tasks
- `package.json` for root scripts and local Stego package dependencies
- `tsconfig.stego-template.json` for shared template authoring defaults

## Project layout

Each project under `projects/<project-id>/` contains its own source and configuration.

Typical folders:

- `content/` for authored leaves
- `notes/` for planning and scratch material
- `assets/` for local images and other source assets
- `templates/` for TSX manuscript templates powered by `@stego-labs/engine`
- `dist/` for generated outputs

## Recommended VS Code workflow

When actively working on one project, open that project directory directly in VS Code instead of the whole workspace.

That keeps editor context focused and ensures project recommendations, metadata controls, image controls, comments, and the explorer all stay scoped to the active project.

## Template authoring support

Scaffolded projects include a `tsconfig.json` that points TSX files at `@stego-labs/engine`.

Open `templates/book.template.tsx` and VS Code will understand the template context, `Stego.*` components, and collection helpers such as `groupBy(...)` and `splitBy(...)`. Advanced template mode uses the same editor support for any auto-discovered `templates/*.template.tsx`.

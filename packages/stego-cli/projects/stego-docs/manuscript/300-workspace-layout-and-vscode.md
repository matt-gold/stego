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

- `manuscript/` for ordered source chapters or sections
- `notes/` for planning and references
- `spine/` for canonical entities
- `assets/` for local images and other manuscript assets
- `templates/` for TSX build templates powered by `@stego/engine`
- `dist/` for generated outputs

## Recommended VS Code workflow

When actively working on one project, open that project directory directly in VS Code instead of the whole workspace.

That keeps editor context focused and ensures project recommendations, metadata controls, image controls, and the Spine Browser all stay scoped to the active project.

## Template authoring support

Scaffolded projects include a `tsconfig.json` that points TSX files at `@stego/engine`.

Open `templates/book.template.tsx` and VS Code will understand the template context, `Stego.*` components, and collection helpers such as `groupBy(...)` and `splitBy(...)`.

## Prose-style editor settings prompt

When you run `stego init` or `stego new-project`, Stego can optionally write project-level markdown editor settings for a prose-friendly font and layout.

Those settings are written to the project folder only, not the workspace root, so different projects can use different editor preferences.

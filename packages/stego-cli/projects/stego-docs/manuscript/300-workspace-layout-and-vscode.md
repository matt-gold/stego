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
---

# Workspace Layout and VS Code

## Workspace-level files

At the workspace root you will typically see:

- `stego.config.json` for shared configuration and stage policies
- `projects/` for all writing projects
- `.vscode/tasks.json` for common root tasks
- `package.json` for root scripts and tool dependencies

## Project layout

Each project under `projects/<project-id>/` contains its own source and configuration.

Typical folders:

- `manuscript/` for ordered source chapters or sections
- `notes/` for planning and references
- `spine/` for canonical entities (when a project enables Spine categories)
- `dist/` for generated outputs

## Recommended VS Code workflow

When actively working on one project, open that project directory directly in VS Code instead of the whole workspace.

That keeps editor context focused and ensures project recommendations apply at the project level.

## Prose-style editor settings prompt

When you run `stego init` or `stego new-project`, Stego can optionally write project-level markdown editor settings for a prose-friendly font and layout.

Those settings are written to the project folder only, not the workspace root, so different projects can use different editor preferences.

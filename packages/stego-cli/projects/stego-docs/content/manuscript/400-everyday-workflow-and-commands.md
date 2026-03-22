---
status: draft
chapter: 4
chapter_title: Everyday Workflow and Commands
concepts:
  - CON-PROJECT
  - CON-MANUSCRIPT
  - CON-METADATA
  - CON-DIST
  - CON-TEMPLATE-ENGINE
commands:
  - CMD-LIST-PROJECTS
  - CMD-NEW-PROJECT
  - CMD-NEW
  - CMD-VALIDATE
  - CMD-BUILD
  - CMD-CHECK-STAGE
  - CMD-EXPORT
  - CMD-TEMPLATE-BUILD
  - CMD-TEMPLATE-EXPORT
workflows:
  - FLOW-DAILY-WRITING
  - FLOW-NEW-PROJECT
  - FLOW-BUILD-EXPORT
integrations:
  - INT-VSCODE
  - INT-STEGO-ENGINE
id: DOC-EVERYDAY-WORKFLOW-AND-COMMANDS
kind: chapter
---

# Everyday Workflow and Commands

## Daily loop

A practical Stego writing loop looks like this:

1. Open one project folder in VS Code.
2. Write or revise leaves in `content/`.
3. Run `stego validate` for fast structural feedback.
4. Run `stego build` to inspect the compiled manuscript from the current template or templates.
5. Run `stego check-stage` before moving to the next editorial milestone.
6. Export formats as needed for review or delivery.

## Root-level command usage

From the workspace root, target a project with `--project` or `-p`.

```bash
stego list-projects
stego new -p fiction-example --id CH-NEW-SCENE
stego content read -p fiction-example --format json
stego validate -p fiction-example
stego build -p fiction-example
stego check-stage -p fiction-example --stage revise
stego export -p fiction-example --format md
```

## Template debugging commands

Normal `build` and `export` already use the project template flow. In the default lane that is `templates/book.template.tsx`. In advanced template mode, Stego auto-discovers `templates/*.template.tsx`, builds every discovered template, and exports through the unique matching template for the requested presentation target.

```bash
stego template build -p fiction-example
stego template export -p fiction-example --format pdf
```

`template build` writes a compiled markdown artifact and a backend-document JSON file to `dist/` so you can inspect exactly what `@stego-labs/engine` produced for one explicit template.

## Create a new project

Use `stego new-project` from the workspace root.

```bash
stego new-project --project my-book --title "My Book"
```

This scaffolds `content/`, `notes/`, `assets/`, `templates/`, and `dist/`, plus project config, local scripts, extension recommendations, and project-level template type-checking.

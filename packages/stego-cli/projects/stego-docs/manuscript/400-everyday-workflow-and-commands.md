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
---

# Everyday Workflow and Commands

## Daily loop

A practical Stego writing loop looks like this:

1. Open one project folder in VS Code.
2. Write or revise files in `manuscript/`.
3. Run `stego validate` for fast structural feedback.
4. Run `stego build` to inspect the compiled output from the current template.
5. Run `stego check-stage` before moving to the next editorial milestone.
6. Export formats as needed for review or delivery.

## Root-level command usage

From the workspace root, target a project with `--project` or `-p`.

```bash
stego list-projects
stego new -p fiction-example
stego validate -p fiction-example
stego build -p fiction-example
stego check-stage -p fiction-example --stage revise
stego export -p fiction-example --format md
```

## Template debugging commands

Normal `build` and `export` already use the project template. When you want to inspect the render plan directly, use the template commands.

```bash
stego template build -p fiction-example
stego template export -p fiction-example --format pdf
```

`template build` writes a compiled markdown artifact and a render-plan JSON file to `dist/` so you can inspect exactly what `@stego-labs/engine` produced.

## Project-local scripts

Projects also include local npm scripts. These are useful when you want to stay in one project directory.

```bash
cd projects/fiction-example
npm run new
npm run validate
npm run build
npm run check-stage -- --stage revise
npm run export -- --format md
npm run typecheck
```

## Create a new project

Use `stego new-project` from the workspace root.

```bash
stego new-project --project my-book --title "My Book"
```

This scaffolds manuscript, notes, spine, assets, templates, and dist folders, a project config, local scripts, extension recommendations, and project-level template type-checking.

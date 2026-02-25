---
status: draft
chapter: 4
chapter_title: Everyday Workflow and Commands
concepts:
  - CON-PROJECT
  - CON-MANUSCRIPT
  - CON-METADATA
  - CON-DIST
commands:
  - CMD-LIST-PROJECTS
  - CMD-NEW-PROJECT
  - CMD-VALIDATE
  - CMD-BUILD
  - CMD-CHECK-STAGE
  - CMD-EXPORT
workflows:
  - FLOW-DAILY-WRITING
  - FLOW-NEW-PROJECT
  - FLOW-BUILD-EXPORT
integrations:
  - INT-VSCODE
---

# Everyday Workflow and Commands

## Daily loop

A practical Stego writing loop looks like this:

1. Open one project folder in VS Code.
2. Write or revise files in `manuscript/`.
3. Run `stego validate` for fast structural feedback.
4. Run `stego build` to inspect the compiled output.
5. Run `stego check-stage` before moving to the next editorial milestone.
6. Export formats as needed for review or delivery.

## Root-level command usage

From the workspace root, target a project with `--project`.

```bash
stego list-projects
stego validate --project fiction-example
stego build --project fiction-example
stego check-stage --project fiction-example --stage revise
stego export --project fiction-example --format md
```

## Project-local scripts

Projects also include local npm scripts. These are useful when you want to stay in one project directory.

```bash
cd projects/fiction-example
npm run validate
npm run build
npm run check-stage -- --stage revise
npm run export -- --format md
```

## Create a new project

Use `stego new-project` from the workspace root.

```bash
stego new-project --project my-book --title "My Book"
```

This scaffolds manuscript, notes, spine, and dist folders, a project config, local scripts, extension recommendations, and (optionally) project-level prose editor settings.

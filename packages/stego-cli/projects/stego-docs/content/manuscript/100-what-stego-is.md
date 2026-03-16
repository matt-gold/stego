---
status: draft
chapter: 1
chapter_title: What Stego Is
concepts:
  - CON-WORKSPACE
  - CON-PROJECT
  - CON-MANUSCRIPT
  - CON-NOTES
  - CON-DIST
workflows:
  - FLOW-INIT-WORKSPACE
  - FLOW-DAILY-WRITING
commands:
  - CMD-INIT
  - CMD-LIST-PROJECTS
integrations:
  - INT-VSCODE
  - INT-STEGO-EXTENSION
id: DOC-WHAT-STEGO-IS
kind: chapter
---

# What Stego Is

Stego is a Markdown-first writing workflow organized around a workspace that contains one or more writing projects.

It combines authored leaves, validation, stage gates, build output, and export into a single CLI-driven system that works well with Git and VS Code.

The CLI is the command and automation surface, and the Stego VS Code extension is the official UI for working inside Stego projects.

## Core model

A Stego workspace has a shared root configuration and a `projects/` directory.

Each project is self-contained and typically includes:

- `content/` for authored leaves
- `notes/` for planning and scratch material
- `assets/` for local images and related source assets
- `templates/` for TSX manuscript templates
- `dist/` for generated output only

## Why this structure works

Stego keeps authored leaves close to the tools that evaluate and build them.

That makes it easier to:

- validate metadata and structure early
- run stage-aware checks before release milestones
- build deterministic manuscript output for review
- keep generated artifacts separate from hand-edited source material

## Who this is for

Stego works for fiction, nonfiction, and internal documentation teams.

This project (`stego-docs`) demonstrates the documentation use case. The parent workspace includes a `fiction-example` as well.

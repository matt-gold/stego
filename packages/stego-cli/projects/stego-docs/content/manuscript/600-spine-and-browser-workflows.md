---
status: draft
chapter: 6
chapter_title: Linking and Explorer Workflows
concepts:
  - CON-SPINE
  - CON-SPINE-CATEGORY
  - CON-METADATA
  - CON-PROJECT
  - CON-TEMPLATE-ENGINE
commands:
  - CMD-VALIDATE
  - CMD-BUILD
workflows:
  - FLOW-DAILY-WRITING
  - FLOW-STAGE-PROMOTION
  - FLOW-BUILD-EXPORT
configuration:
  - CFG-SPINE-CATEGORIES
  - CFG-TEMPLATES
integrations:
  - INT-STEGO-EXTENSION
  - INT-VSCODE
  - INT-STEGO-ENGINE
id: DOC-SPINE-AND-BROWSER-WORKFLOWS
kind: chapter
---

# Linking and Explorer Workflows

Stego uses explicit leaf ids for internal references.

## How `stego-docs` uses leaves

This documentation project stores ordered chapter leaves under `content/manuscript/` and reference leaves under `content/reference/`.

Templates group those leaves differently depending on the output:

- chapter leaves become the main manuscript flow
- reference leaves become a backmatter appendix
- `Stego.Link` resolves leaf ids into clickable manuscript links

## Why this is useful for documentation teams

Using leaves for both narrative chapters and structured reference material gives you:

- a canonical glossary without a second content model
- a browseable map of commands and workflows
- traceability from one leaf to related concepts
- the option to turn reference leaves into appendices, glossaries, or handbooks at build time

## Explorer workflow

When working in VS Code with the Stego extension, open the project folder and use the explorer to inspect linked leaves, headings, and backlinks while editing chapters.

This keeps the editor and compiled manuscript aligned around the same ids and the same source files.

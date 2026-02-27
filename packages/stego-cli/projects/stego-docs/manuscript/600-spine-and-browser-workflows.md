---
status: draft
chapter: 6
chapter_title: Spine and Browser Workflows
concepts:
  - CON-SPINE
  - CON-SPINE-CATEGORY
  - CON-METADATA
  - CON-PROJECT
commands:
  - CMD-VALIDATE
workflows:
  - FLOW-DAILY-WRITING
  - FLOW-STAGE-PROMOTION
configuration:
  - CFG-SPINE-CATEGORIES
integrations:
  - INT-STEGO-EXTENSION
  - INT-VSCODE
---

# Spine and Browser Workflows

Stego's Spine model is useful beyond fiction. In this project, Spine acts as a canonical graph for documentation topics.

## How `stego-docs` uses Spine

The documentation project defines categories for:

- commands
- concepts
- workflows
- configuration topics
- integrations

Each manuscript chapter references relevant entries in frontmatter metadata. That lets the Stego extension's Spine Browser act as an alternate way to explore the docs.

## Why this is useful for documentation teams

Using Spine in docs gives you:

- a canonical glossary with relationships
- a browseable map of commands and workflows
- traceability from a chapter to the concepts it depends on
- a reusable pattern for internal process documentation

## Fiction workflows still use the same model

The `fiction-example` project shows the same mechanism applied to story continuity with entities such as characters, locations, and sources.

That makes `stego-docs` a good bridge project: it documents the feature while demonstrating a non-fiction use case for the same structure.

## Extension workflow

When working in VS Code with the Stego extension, open the project folder and use the Spine Browser to inspect categories, entries, and cross-links while editing chapters.

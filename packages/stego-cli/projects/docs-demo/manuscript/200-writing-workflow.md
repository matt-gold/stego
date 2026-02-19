---
status: revise
chapter: 1
chapter_title: Overview
---

# Fiction Workflow and Story Bible Features

This project does not enable Story Bible categories, but Stego fully supports them.

## How Story Bible works in Stego

In fiction projects, `project.json` can define bible categories like:

- `characters` with prefix `CHAR`
- `locations` with prefix `LOC`
- `sources` with prefix `SRC`

Each category maps to a markdown file under `story-bible/`.

## Identifier model

Story Bible entries use stable identifiers such as:

- `CHAR-MATTHAEUS`
- `LOC-HOTEL-DIEU`
- `SRC-GALEN`

Writers can reference these identifiers directly in manuscript metadata and prose.

## Sidebar and Bible Browser behavior

In the Stego VS Code extension, identifiers become interactive:

- click from manuscript metadata to open Bible Browser context
- browse categories and entries from Browser home
- inspect entry markdown, links, and backlinks
- track references across manuscript and notes

## Why this matters for fiction

Story Bible structure gives fiction teams a canonical layer for consistency:

- one source of truth for entities
- traceability from manuscript usage to canonical entry
- faster continuity review during revise/proof stages

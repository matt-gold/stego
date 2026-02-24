---
status: revise
chapter: 1
chapter_title: Overview
---

# Fiction Workflow and Spine Features

This project does not enable Spine categories, but Stego fully supports them.

## How Spine works in Stego

In fiction projects, `stego-project.json` can define spine categories like:

- `characters` with prefix `CHAR`
- `locations` with prefix `LOC`
- `sources` with prefix `SRC`

Each category maps to a markdown file under `spine/`.

## Identifier model

Spine entries use stable identifiers such as:

- `CHAR-MATTHAEUS`
- `LOC-HOTEL-DIEU`
- `SRC-GALEN`

Writers can reference these identifiers directly in manuscript metadata and prose.

## Sidebar and Spine Browser behavior

In the Stego VS Code extension, identifiers become interactive:

- click from manuscript metadata to open Spine Browser context
- browse categories and entries from Browser home
- inspect entry markdown, links, and backlinks
- track references across manuscript and notes

## Why this matters for fiction

Spine structure gives fiction teams a canonical layer for consistency:

- one source of truth for entities
- traceability from manuscript usage to canonical entry
- faster continuity review during revise/proof stages


<!-- stego-comments:start -->

### CMT-0001
<!-- meta64: eyJzdGF0dXMiOiJvcGVuIiwiYW5jaG9yIjoicGFyYWdyYXBoIiwicGFyYWdyYXBoX2luZGV4IjoxMywic2lnbmF0dXJlIjoiZm52MWE6MWE2YmJhOWEiLCJleGNlcnB0IjoiIyMgV2h5IHRoaXMgbWF0dGVycyBmb3IgZmljdGlvbiJ9 -->
> _2026-02-20T03:46:52.817Z | mattgold_
>
> test

### CMT-0002
<!-- meta64: eyJzdGF0dXMiOiJvcGVuIiwiYW5jaG9yIjoicGFyYWdyYXBoIiwicGFyYWdyYXBoX2luZGV4IjoxMywic2lnbmF0dXJlIjoiZm52MWE6MWE2YmJhOWEiLCJleGNlcnB0IjoiIyMgV2h5IHRoaXMgbWF0dGVycyBmb3IgZmljdGlvbiJ9 -->
> _2026-02-20T03:47:21.646Z | mattgold_
>
> yes yes we knoow

### CMT-0003
<!-- meta64: eyJzdGF0dXMiOiJvcGVuIiwiYW5jaG9yIjoicGFyYWdyYXBoIiwicGFyYWdyYXBoX2luZGV4IjoxMywic2lnbmF0dXJlIjoiZm52MWE6MWE2YmJhOWEiLCJleGNlcnB0IjoiIyMgV2h5IHRoaXMgbWF0dGVycyBmb3IgZmljdGlvbiJ9 -->
> _2026-02-20T03:50:27.114Z | mattgold_
>
> test

<!-- stego-comments:end -->

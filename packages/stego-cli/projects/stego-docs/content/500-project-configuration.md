---
status: draft
chapter: 5
chapter_title: Project Configuration
concepts:
  - CON-WORKSPACE
  - CON-PROJECT
  - CON-METADATA
  - CON-TEMPLATE-ENGINE
  - CON-SPINE
  - CON-SPINE-CATEGORY
commands:
  - CMD-VALIDATE
  - CMD-BUILD
  - CMD-TEMPLATE-BUILD
workflows:
  - FLOW-NEW-PROJECT
  - FLOW-DAILY-WRITING
configuration:
  - CFG-STEGO-CONFIG
  - CFG-STEGO-PROJECT
  - CFG-REQUIRED-METADATA
  - CFG-TEMPLATES
  - CFG-TEMPLATE-COLLECTIONS
  - CFG-SPINE-CATEGORIES
  - CFG-STAGE-POLICIES
  - CFG-ALLOWED-STATUSES
integrations:
  - INT-STEGO-ENGINE
id: DOC-PROJECT-CONFIGURATION
kind: chapter
---

# Project Configuration

Stego uses two configuration layers:

- `stego.config.json` at the workspace root for shared directories and stage policies
- `stego-project.json` inside each project for project-specific rules

## Metadata requirements

Projects can declare advisory metadata keys in `requiredMetadata`.

Stego reports missing keys as warnings so teams can standardize frontmatter without blocking early drafting.

At the project level, `requiredMetadata` applies to manuscript leaves.

Branches can narrow or extend that policy locally with `_branch.md`:

```yaml
---
label: Characters
requiredLeafMetadata:
  - kind
  - label
---
```

`requiredLeafMetadata` applies only to the direct leaves in that branch directory. That is the right place for reference-specific requirements such as `kind` or `label`.

Common manuscript keys include `status`, ordered boundary fields such as `chapter`, and project-specific metadata such as point of view or timeline.

## Leaf image settings

Stego projects use `assets/` for local leaf images.

Project-level image defaults belong in `stego-project.json`.

Leaf files can define per-path overrides with `images` frontmatter. Global keys should stay in project config.

## Templates

Build structure lives in `templates/`.

Templates are plain TSX modules powered by `@stego-labs/engine`. They receive project metadata plus `ctx.content`, the root content tree loaded from `content/`, `ctx.allLeaves`, the full ordered flat array of leaves, and `ctx.allBranches`, the flat array of discovered branches under `content/`.

`ctx.content.leaves` are the direct leaves under the root `content/` directory. `ctx.content.branches` are the top-level branches, and each branch continues downward through `branch.branches`.

Each branch has a structural `id`, an optional `parentId`, a `leaves` array for the direct leaves in that branch, and a `branches` array for child branches. Each leaf also exposes `branchId` so template code can move in either direction.

Use template code to group leaves, insert headings, control page breaks, and render frontmatter or backmatter. Ordered grouping is typically done with `Stego.splitBy(ctx.allLeaves, ...)`, which preserves file order and lets boundary-only metadata flow across subsequent leaves.

Use `Stego.groupBy(...)` when you want bucketed summaries that ignore file-order boundaries.

Stego supports two lanes:

- default lane: one simple `templates/book.template.tsx` using the broad `Stego` API
- advanced template mode: multiple templates per project, auto-discovered from `templates/*.template.tsx`, with target declarations such as `defineTemplate({ targets: ["docx", "pdf"] as const }, ...)`

## Reference material

Stego no longer has a first-class spine model. Reference material is just another class of leaf, typically stored under `content/reference/` and tagged with metadata such as `kind: reference`.

That keeps the engine simpler while letting templates and the extension build reference appendices, glossaries, or lookup views from the same underlying leaf collection.

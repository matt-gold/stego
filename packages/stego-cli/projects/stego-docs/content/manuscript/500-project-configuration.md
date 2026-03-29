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

Stego reports missing keys as warnings so teams can standardize frontmatter without blocking early drafting.

Metadata requirements and defaults live on branches through `_branch.md`:

```yaml
---
label: Manuscript
leafPolicy:
  requiredMetadata:
    - status
---
```

Branch `leafPolicy` inherits from parent branches by default. Use it to define subtree-level metadata rules and defaults for leaves. `requiredMetadata` unions through the branch chain, and `defaults` apply nearest-branch-wins fallback values to descendant leaves.

Common manuscript keys include `status`, ordered boundary fields such as `chapter`, and project-specific metadata such as point of view or timeline.

## Leaf image settings

Stego projects use `assets/` for local leaf images.

Project-level image defaults belong in `stego-project.json`.

The official manuscript subtree also belongs in `stego-project.json`:

```json
{
  "manuscriptSubdir": "manuscript"
}
```

That setting is relative to `content/`.

Think of it as the answer to: "Which part of `content/` is the manuscript draft?"

In v1 it drives manuscript-scoped conveniences such as:

- the default target for `stego new`
- manuscript-focused metrics in the extension
- other editor workflows that need a practical manuscript scope

It does not change the underlying content model:

- templates still receive the full content tree
- `build` and `export` still see all leaves unless template code narrows the set
- reference material under other branches is still normal Stego content

If `manuscriptSubdir` is absent, Stego keeps older projects working by falling back to `content/manuscript/` when that directory exists, and to `content/` otherwise.

Leaf files can define per-path overrides with `images` frontmatter. Global keys should stay in project config.

## Templates

Build structure lives in `templates/`.

Templates are plain TSX modules powered by `@stego-labs/engine`. They receive project metadata plus `ctx.content`, the root content tree loaded from `content/`, `ctx.allLeaves`, the full ordered flat array of leaves, and `ctx.allBranches`, the flat array of discovered branches under `content/`.

`ctx.content.leaves` are the direct leaves under the root `content/` directory, which may be empty if a project keeps ordered draft leaves under `content/manuscript/`. `ctx.content.branches` are the top-level branches, and each branch continues downward through `branch.branches`.

Each branch has a structural `id`, an optional `parentId`, a `leaves` array for the direct leaves in that branch, and a `branches` array for child branches. Each leaf also exposes `branchId` so template code can move in either direction.

Use template code to group leaves, insert headings, control page breaks, render frontmatter or backmatter, and build alternate outputs such as reports or stats pages.

Ordered grouping is typically done with `Stego.splitBy(ctx.allLeaves, ...)`, which preserves file order and lets boundary-only metadata flow across subsequent leaves.

Use `Stego.groupBy(...)` when you want bucketed summaries that ignore file-order boundaries.

Templates can also inspect manuscript text directly through helpers such as:

- `Stego.getText(...)`
- `Stego.getTextTokens(...)`
- `Stego.getWords(...)`
- `Stego.getWordCount(...)`

That makes it practical to build manuscript title pages with dynamic word counts, analysis templates, glossaries, or other data-driven outputs without leaving the template layer.

Stego supports two lanes:

- default lane: one simple `templates/book.template.tsx` using the broad `Stego` API
- advanced template mode: multiple templates per project, auto-discovered from `templates/*.template.tsx`, with target declarations such as `defineTemplate({ targets: ["docx", "pdf"] }, (ctx: TemplateContext<...>, Stego) => ...)`

## Reference material

Stego no longer has a first-class spine model. Reference material is just another class of leaf, typically stored under `content/reference/` and tagged with metadata such as `kind: reference`.

That keeps the engine simpler while letting templates and the extension build reference appendices, glossaries, or lookup views from the same underlying leaf collection.

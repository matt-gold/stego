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
---

# Project Configuration

Stego uses two configuration layers:

- `stego.config.json` at the workspace root for shared directories and stage policies
- `stego-project.json` inside each project for project-specific rules

## Metadata requirements

Projects can declare advisory metadata keys in `requiredMetadata`.

Stego reports missing keys as warnings so teams can standardize frontmatter without blocking early drafting.

Common keys include `status`, ordered boundary fields such as `chapter`, and project-specific metadata such as point of view, timeline, or reference identifiers.

## Manuscript image settings

Stego projects use `assets/` for local manuscript images.

Project-level image defaults belong in `stego-project.json`:

```json
{
  "images": {
    "layout": "block",
    "align": "center",
    "width": "50%",
    "classes": ["illustration"]
  }
}
```

Manuscript files can define per-path overrides with `images` frontmatter:

```yaml
images:
  assets/maps/city-plan.png:
    layout: inline
    align: left
    width: 100%
```

Global keys are `width`, `height`, `classes`, `id`, `attrs`, `layout`, and `align`, but those defaults should be set in project config.

All manuscript-frontmatter keys under `images` that are not reserved defaults are treated as per-image overrides by project-relative asset path.

When the same image also has inline Pandoc attrs in markdown, inline attrs win.

Validation warns if a local image target is outside `assets/`.

## Templates

Build structure now lives in `templates/book.template.tsx`.

Templates are plain TSX modules powered by `@stego-labs/engine`. They receive project metadata plus generic collections for manuscripts, spine entries, and spine categories.

Use template code to group manuscripts, insert headings, control page breaks, and render frontmatter or backmatter. Ordered grouping is typically done with `ctx.collections.manuscripts.splitBy(...)`, which preserves file order and lets boundary-only metadata flow across subsequent files.

Use `groupBy(...)` when you want bucketed summaries that ignore file-order boundaries.

## Spine categories

Spine V2 infers categories from directory structure under `spine/`.

Each category lives at `spine/<category>/`, category metadata lives in `spine/<category>/_category.md`, and each entry is its own markdown file in that category directory tree.

This project uses spine categories to model documentation entities such as commands, concepts, workflows, configuration topics, and integrations.

---
status: line-edit
chapter: 2
chapter_title: Quality Pipeline
---

# Validation and Stage Gates

Stego separates baseline validation from stage-specific enforcement.

## Baseline validate

`validate` checks project and manuscript integrity, including:

- frontmatter parse and metadata structure
- markdown structure and local link integrity
- project and manuscript layout assumptions

## Stage gate model

`check-stage` applies stricter checks as status increases:

- `draft`: structure-first, low friction
- `revise`: continuity expectations for Spine projects
- `line-edit`: spell-check enabled
- `proof`: markdown lint, spell-check, strict local links
- `final`: same strictness as proof with final-status expectations

## File-scoped and project-scoped checks

Stego supports both:

- local file checks during active editing
- project-wide stage checks before release

In the extension UI, local checks run from manuscript status controls, while project checks run from the sidebar header.

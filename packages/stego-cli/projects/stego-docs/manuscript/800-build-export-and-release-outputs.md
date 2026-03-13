---
status: draft
chapter: 8
chapter_title: Build, Export, and Release Outputs
concepts:
  - CON-MANUSCRIPT
  - CON-DIST
  - CON-TEMPLATE-ENGINE
  - CON-STAGE-GATE
commands:
  - CMD-BUILD
  - CMD-EXPORT
  - CMD-CHECK-STAGE
  - CMD-TEMPLATE-BUILD
  - CMD-TEMPLATE-EXPORT
workflows:
  - FLOW-BUILD-EXPORT
  - FLOW-PROOF-RELEASE
configuration:
  - CFG-TEMPLATES
  - CFG-TEMPLATE-COLLECTIONS
integrations:
  - INT-PANDOC
  - INT-MARKDOWNLINT
  - INT-CSPELL
  - INT-STEGO-ENGINE
---

# Build, Export, and Release Outputs

## Build contract

`stego build` compiles one project's source through `templates/book.template.tsx` and writes a generated markdown artifact to `dist/`.

The build is deterministic because source ordering comes from filename prefixes, while structure, headings, frontmatter, and backmatter come from template code.

Generated files in `dist/` should not be hand-edited.

## Render-plan inspection

`stego template build` writes two debug artifacts:

- `dist/<project-id>.template.md`
- `dist/<project-id>.template.render-plan.json`

Use them when you are authoring or debugging a template with `@stego/engine`.

## Export formats

`stego export` supports markdown output directly and optional richer formats through Pandoc, including docx, pdf, and epub.

For local manuscript images, keep files in `assets/`. Stego exports with project-aware resource paths so image references in compiled markdown can resolve during Pandoc conversion.

EPUB exports include a default stylesheet for image layout metadata (`data-layout`, `data-align`, and related block-layout attrs), so block/inline and left/center/right image alignment rules apply without extra setup.

If you export pdf through Pandoc, you also need a compatible PDF engine installed on your machine.

## Recommended release sequence

1. Run `stego validate` during drafting and revision.
2. Run `stego check-stage` for the intended milestone.
3. Run `stego build` to produce the compiled manuscript.
4. Run `stego export` for the delivery format.
5. Archive exported artifacts from `dist/exports` as release outputs.

## Reproducibility rule

Treat `manuscript/`, `notes/`, `spine/`, `assets/`, and `templates/` as source of truth.

Treat `dist/` as reproducible output that can be rebuilt at any time.

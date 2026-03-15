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
id: DOC-BUILD-EXPORT-AND-RELEASE-OUTPUTS
kind: chapter
---

# Build, Export, and Release Outputs

## Build contract

`stego build` compiles one project's leaves through the active template flow and writes generated manuscript artifacts to `dist/`.

In the default lane, that means `templates/book.template.tsx`.

In advanced template mode, Stego auto-discovers `templates/*.template.tsx`, compiles each discovered template once, and writes one markdown/render-plan artifact pair per template.

The build is deterministic because leaf ordering comes from filename prefixes, while structure, headings, frontmatter, and backmatter come from template code.

Generated files in `dist/` should not be hand-edited.

## Render-plan inspection

`stego template build` writes two debug artifacts:

- `dist/<project-id>.template.md`
- `dist/<project-id>.template.render-plan.json`

Use them when you are authoring or debugging a template with `@stego-labs/engine`.

## Export formats

`stego export` supports markdown output directly and optional richer formats through Pandoc, including docx, pdf, and epub.

Treat markdown output as the compiled manuscript artifact for inspection, diffing, and lightweight handoff. It is useful because it shows the resolved template structure in a portable text form, but it is not the full-fidelity target for every Stego layout primitive.

Markdown is a special-case export artifact. It stays on the deterministic default template path unless you explicitly bypass it with `--template`.

For presentation targets in advanced template mode, Stego selects the unique matching discovered template. If more than one discovered template supports the same presentation target, export fails with an ambiguity error until you pass `--template`.

When layout fidelity matters, prefer docx, pdf, or epub.

For local images, keep files in `assets/`. Stego exports with project-aware resource paths so image references in the compiled manuscript can resolve during Pandoc conversion.

## Reproducibility rule

Treat `content/`, `notes/`, `assets/`, and `templates/` as source of truth.

Treat `dist/` as reproducible output that can be rebuilt at any time.

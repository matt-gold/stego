---
status: draft
chapter: 8
chapter_title: Build, Export, and Release Outputs
concepts:
  - CON-MANUSCRIPT
  - CON-DIST
  - CON-COMPILE-STRUCTURE
  - CON-STAGE-GATE
commands:
  - CMD-BUILD
  - CMD-EXPORT
  - CMD-CHECK-STAGE
workflows:
  - FLOW-BUILD-EXPORT
  - FLOW-PROOF-RELEASE
configuration:
  - CFG-COMPILE-STRUCTURE
integrations:
  - INT-PANDOC
  - INT-MARKDOWNLINT
  - INT-CSPELL
---

# Build, Export, and Release Outputs

## Build contract

`stego build` compiles one project's manuscript files into a single markdown output in `dist/`.

The build is deterministic because source ordering comes from filename prefixes and grouping behavior comes from project configuration.

Generated files in `dist/` should not be hand-edited.

## Export formats

`stego export` supports markdown output directly and optional richer formats through Pandoc, including docx, pdf, and epub.

If you export pdf through Pandoc, you also need a compatible PDF engine installed on your machine.

## Recommended release sequence

1. Run `stego validate` during drafting and revision.
2. Run `stego check-stage` for the intended milestone.
3. Run `stego build` to produce the compiled manuscript.
4. Run `stego export` for the delivery format.
5. Archive exported artifacts from `dist/exports` as release outputs.

## Reproducibility rule

Treat `manuscript/`, `notes/`, and `spine/` as source of truth.

Treat `dist/` as reproducible output that can be rebuilt at any time.

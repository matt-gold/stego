---
status: line-edit
chapter: 2
chapter_title: Quality Pipeline
---

# Build and Export Operations

Stego keeps authoring and distribution predictable.

## Build behavior

`build` compiles manuscript sources into one output markdown file in `dist/`.

Use build output for:

- full-read review passes
- stakeholder circulation
- archival snapshots of a known state

## Export formats

`export` supports:

- `md`
- `docx`
- `pdf`
- `epub`

`docx`, `pdf`, and `epub` require `pandoc`. `pdf` also requires a PDF engine (for example `tectonic`, `xelatex`, or `pdflatex`).

## Recommended release sequence

1. Run file checks while drafting.
2. Run project stage checks before release.
3. Run build.
4. Export the target format.
5. Archive output from `dist/exports` as release artifacts.

## Practical note for documentation teams

You can document Spine features and fiction workflows in a project like this one without enabling Spine categories. That keeps docs simple while still covering the full Stego feature set.

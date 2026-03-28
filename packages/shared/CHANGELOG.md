# @stego-labs/shared

## 1.2.0

### Minor Changes

- 4e62b53: Rename the render-plan contract to a backend document and move target-specific export preparation from the engine into a clearer CLI presentation-export pipeline.

### Patch Changes

- 142c6a3: [codex] Add markdown spacer directive and renumber scaffold leaves

## 1.1.1

### Patch Changes

- af43c8c: Rename the render-plan contract to a backend document and move target-specific export preparation from the engine into a clearer CLI presentation-export pipeline.

## 1.1.0

### Minor Changes

- a882ceb: Add a first-class LaTeX target, print typography controls, markdown block normalization, and improved multi-template export support in the extension and project scaffolds.

## 1.0.5

### Patch Changes

- c0d590b: Improve branch-scoped metadata requirements, fix example project defaults, and refine extension sidebar behavior with faster manuscript loading and cleaner Explore details.

## 1.0.4

### Patch Changes

- bd81f9e: Improve the leaf and branch template model with root-aware branch lists, stricter template target discovery, and a new `TemplateTypes` helper for target-aware template typing.

## 1.0.3

### Patch Changes

- b66c607: Add an opt-in target-aware template mode for advanced projects, including shared export-target capability contracts, multi-template auto-discovery for build/export, and narrowed Stego authoring types for declared presentation targets. This also enforces declared targets consistently at runtime and on explicit template exports, requires `templates/book.template.tsx` for the default markdown lane, and updates the CLI/engine docs to explain the default versus advanced template workflows.
- 08bff8d: Cut Stego over from the legacy manuscript/spine model to the new content/leaf + branch model, including new `content read` CLI support, branch-aware validation and indexing, updated example projects and docs, the Explore sidebar replacing Spine UI flows, and template/runtime support for leaf-based rendering and linking. This also tightens leaf creation and starter template behavior, improves typed template metadata ergonomics, and documents markdown export as a lower-fidelity compiled artifact rather than a presentation-fidelity target.

## 1.0.2

### Patch Changes

- 6e1fc96: Add a `Stego.KeepTogether` template primitive with real DOCX, PDF, and HTML/EPUB support, add DOCX parity for existing block layout props (`spaceBefore`, `spaceAfter`, `insetLeft`, `insetRight`, `firstLineIndent`, and `align`) plus aligned block images, and fix template authoring types so TSX templates typecheck correctly.

## 1.0.1

### Patch Changes

- 2930e2f: Rename the publishable Stego package family from `@stego/*` to `@stego-labs/*` and update CI, release automation, docs, scaffolds, and workspace dependencies to use the new scope.

## 1.0.0

### Minor Changes

- c7cc376: Replace the legacy `compileStructure` build pipeline with the template-driven `@stego-labs/engine` path.

  For `@stego-labs/cli`, `build` and `export` now derive output from `templates/book.template.tsx`, and legacy `compileStructure` in `stego-project.json` is rejected as unsupported.

  For `@stego-labs/engine`, this release establishes the public TSX template/runtime package, including collection helpers like `splitBy()`, Pandoc render-plan output, and the package/release surface needed for npm distribution.

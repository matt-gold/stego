# @stego-labs/shared

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

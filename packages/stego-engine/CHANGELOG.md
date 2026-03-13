# @stego-labs/engine

## 1.0.0

### Major Changes

- c7cc376: Replace the legacy `compileStructure` build pipeline with the template-driven `@stego-labs/engine` path.

  For `@stego-labs/cli`, `build` and `export` now derive output from `templates/book.template.tsx`, and legacy `compileStructure` in `stego-project.json` is rejected as unsupported.

  For `@stego-labs/engine`, this release establishes the public TSX template/runtime package, including collection helpers like `splitBy()`, Pandoc render-plan output, and the package/release surface needed for npm distribution.

### Patch Changes

- Updated dependencies [c7cc376]
  - @stego-labs/shared@1.0.0

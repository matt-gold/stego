---
"@stego/shared": minor
"stego-cli": major
"stego-engine": major
---

Replace the legacy `compileStructure` build pipeline with the template-driven `stego-engine` path.

For `stego-cli`, `build` and `export` now derive output from `templates/book.template.tsx`, and legacy `compileStructure` in `stego-project.json` is rejected as unsupported.

For `stego-engine`, this release establishes the public TSX template/runtime package, including collection helpers like `splitBy()`, Pandoc render-plan output, and the package/release surface needed for npm distribution.

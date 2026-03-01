---
"stego-cli": minor
"stego-extension": minor
---

Ship workspace-mode and manuscript workflow improvements across the CLI and VS Code extension.

For `stego-cli`, this release adds explicit filename support to `stego new`, updates compile-structure defaults to use `between-groups` page breaks, and removes the default scaffold heading from newly created manuscript files.

For `stego-extension`, this release adds workspace-aware actions (`New Stego Project` and `Open Project`), improves `stego new` behavior (custom filename handling, compatibility fallback for older CLI versions, and no immediate metadata auto-collapse), adds a guided `Fill required metadata` action in the document tab, and includes monorepo debug launch/tasks support.

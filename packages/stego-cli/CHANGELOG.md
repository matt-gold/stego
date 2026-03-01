# stego-cli

## 0.3.1

### Patch Changes

- 94cb344: Support `--input -` as a valid stdin payload value for `stego comments add` and add coverage for stdin-based comment creation.

## 0.3.0

### Minor Changes

- 3e39a31: Ship workspace-mode and manuscript workflow improvements across the CLI and VS Code extension.

  For `stego-cli`, this release adds explicit filename support to `stego new`, updates compile-structure defaults to use `between-groups` page breaks, and removes the default scaffold heading from newly created manuscript files.

  For `stego-extension`, this release adds workspace-aware actions (`New Stego Project` and `Open Project`), improves `stego new` behavior (custom filename handling, compatibility fallback for older CLI versions, and no immediate metadata auto-collapse), adds a guided `Fill required metadata` action in the document tab, and includes monorepo debug launch/tasks support.

## 0.2.1

### Patch Changes

- f490fc2: Update monorepo links and package metadata after migration.

## 0.2.0

### Minor Changes

- 0be79cc: add stego new manuscript command

## 0.1.7

### Patch Changes

- 6f58404: Split markdownlint defaults for manuscripts vs general project markdown by adding a manuscript-specific config (`.markdownlint.manuscript.json`) and using it for manuscript stage checks, while keeping stricter heading rules (including MD041) in the general config for spine/notes/docs. Add `stego lint` for project-wide markdownlint runs, with `--manuscript` and `--spine` scope filters.

## 0.1.6

### Patch Changes

- 4deca4d: Consolidate workspace documentation into the `stego-docs` project, rename `plague-demo` to `fiction-example`, and update scaffolded docs and examples.

## 0.1.5

### Patch Changes

- 26985e2: Add repository boilerplate and npm package metadata, including a LICENSE file and package links.

## 0.1.4

### Patch Changes

- 03ad1d7: Prompt during `stego init` and `stego new-project` to optionally enable project-level proportional (prose-style) VS Code font settings, with `yes` selected by default.

## 0.1.3

### Patch Changes

- 16595c7: Improve onboarding docs: update the repo README for the CLI-first workflow and generate a scaffolded workspace `README.md` during `stego init`.

## 0.1.2

### Patch Changes

- cbf742f: Fix `stego init` for npm-installed CLI usage by writing the scaffold `.gitignore` directly instead of copying a package `.gitignore` asset.

## 0.1.1

### Patch Changes

- 69ec710: Publish the installable `stego-cli` package with `stego init`, npm release automation, and scaffolded VS Code extension recommendations.

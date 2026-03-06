# stego-cli

## 0.4.3

### Patch Changes

- 4f46fd3: Fix the release workflow packaging step for `stego-extension` so the shared package directory is prepared and copied into the isolated build context before packaging.

  Also remove unused placeholder domain files in `stego-cli` as part of the same cleanup.

## 0.4.2

### Patch Changes

- 58a8953: Harden comment appendix change detection in the extension to tolerate marker spacing/case variations and simplify temporary JSON payload cleanup with recursive directory removal.

  Clean up CLI internals by removing an unused workspace domain placeholder and align package metadata with the current release version.

## 0.4.1

### Patch Changes

- d2bbe78: Document the full Stego CLI command surface in package docs and add scaffolded `AGENTS.md` guidance so AI agents follow a CLI-first workflow in new workspaces.

  Improve comment UX in the VS Code sidebar by rendering markdown message formatting (including line breaks) and refreshing comment state when edits likely affect the comments appendix.

## 0.4.0

### Minor Changes

- ca8d540: Migrate Spine to the V2 directory-inferred model and align CLI/extension workflows around CLI-owned mutations.

  For `stego-cli`:

  - add `stego spine read`, `stego spine new-category`, and `stego spine new --filename`
  - add universal `stego metadata read|apply` commands for markdown frontmatter files
  - enforce hard cutover away from legacy `spineCategories` runtime config
  - update validation to resolve spine categories and entries from `spine/<category>/` directories and per-entry files
  - add JSON output support for `stego new` and `stego new-project`
  - add `--prose-font yes|no|prompt` to `stego new-project`

  For `stego-extension`:

  - route metadata document writes through `stego metadata apply` via a new CLI client
  - update new project workflow to pass `--prose-font` directly to CLI
  - remove local manuscript scaffold-mutation fallback and rely on CLI output
  - update sidebar category creation flow to invoke `stego spine new-category`
  - infer categories from spine directory structure and flag legacy `spineCategories` config usage

## 0.3.4

### Patch Changes

- 86339f1: Refactor comments to be CLI-owned end-to-end and update extension comment features to use `stego comments` JSON APIs for reads and mutations. This includes canonical comment parsing/serialization in CLI only, nested excerpt rendering fixes, extension comment cache + CLI client integration, and save-time anchor sync/deletion via CLI.

## 0.3.3

### Patch Changes

- 2a13e2a: Align `stego comments add` output with extension comment formatting: human-readable header timestamp with em-dash author separator, nested quoted selection excerpt, and extension-compatible `meta64` fields (`created_at`, `timezone`, `timezone_offset_minutes`, paragraph and excerpt coordinates). Also expand CLI comment parsing compatibility for extension metadata keys and em-dash-style thread headers.

## 0.3.2

### Patch Changes

- 7b5ce1a: Fix `stego comments add` to write canonical comment delimiters (`<!-- comment: CMT-#### -->`) and prevent duplicate comment IDs by deriving the next ID from existing comments in the appendix (including legacy heading compatibility). Also update CLI comment parsing to accept canonical comment delimiters while remaining backward-compatible with legacy `### CMT-####` headings.

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

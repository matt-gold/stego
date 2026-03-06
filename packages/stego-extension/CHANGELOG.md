# Changelog

## 0.6.1

### Patch Changes

- 3a64f57: codex/extension module api seams

## 0.6.0

### Minor Changes

- 5da921b: Ship image support MVP across CLI and extension.

  CLI:

  - Add manuscript image rewriting with project defaults and per-image overrides.
  - Add `layout`/`align` image settings support alongside width/height/classes/id/attrs.
  - Add Pandoc image layout Lua filter for export behavior and include default EPUB image-layout CSS.
  - Strengthen image validation and update docs/scaffolds for assets and image configuration.

  Extension:

  - Add dedicated Images metadata widget that detects images in the active manuscript.
  - Show effective image settings per detected image.
  - Add guided override editor (QuickPick) for layout/align/width/height with preset widths and custom entry.
  - Hide raw manuscript `images` metadata in generic metadata list and route editing through the dedicated widget.

## 0.5.4

### Patch Changes

- f3ebaf0: Fix extension release packaging workflow by linking the temporary `node_modules` directory into the runner temp root before VSIX packaging, so shared workspace dependency resolution works in the isolated package step.

## 0.5.3

### Patch Changes

- 4f46fd3: Fix the release workflow packaging step for `stego-extension` so the shared package directory is prepared and copied into the isolated build context before packaging.

  Also remove unused placeholder domain files in `stego-cli` as part of the same cleanup.

## 0.5.2

### Patch Changes

- 58a8953: Harden comment appendix change detection in the extension to tolerate marker spacing/case variations and simplify temporary JSON payload cleanup with recursive directory removal.

  Clean up CLI internals by removing an unused workspace domain placeholder and align package metadata with the current release version.

## 0.5.1

### Patch Changes

- d2bbe78: Document the full Stego CLI command surface in package docs and add scaffolded `AGENTS.md` guidance so AI agents follow a CLI-first workflow in new workspaces.

  Improve comment UX in the VS Code sidebar by rendering markdown message formatting (including line breaks) and refreshing comment state when edits likely affect the comments appendix.

## 0.5.0

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

## 0.4.1

### Patch Changes

- 86339f1: Refactor comments to be CLI-owned end-to-end and update extension comment features to use `stego comments` JSON APIs for reads and mutations. This includes canonical comment parsing/serialization in CLI only, nested excerpt rendering fixes, extension comment cache + CLI client integration, and save-time anchor sync/deletion via CLI.

## 0.4.0

### Minor Changes

- 3e39a31: Ship workspace-mode and manuscript workflow improvements across the CLI and VS Code extension.

  For `stego-cli`, this release adds explicit filename support to `stego new`, updates compile-structure defaults to use `between-groups` page breaks, and removes the default scaffold heading from newly created manuscript files.

  For `stego-extension`, this release adds workspace-aware actions (`New Stego Project` and `Open Project`), improves `stego new` behavior (custom filename handling, compatibility fallback for older CLI versions, and no immediate metadata auto-collapse), adds a guided `Fill required metadata` action in the document tab, and includes monorepo debug launch/tasks support.

## 0.3.2

### Patch Changes

- b21851c: Fix extension release packaging in the monorepo publish workflow.

## 0.3.1

### Patch Changes

- f490fc2: Update monorepo links and package metadata after migration.

## 0.3.0

### Minor Changes

- 2810944: Add a top-header **New Manuscript** action (`+`) and improve manuscript creation flow.

  - Adds a new extension command for creating manuscripts from the sidebar header.
  - Opens the newly created manuscript in the editor automatically.
  - Falls back to direct `stego-cli` commands when expected `package.json` scripts are missing.
  - Updates workflow command resolution for `new`, `build`, `export`, `check-stage`, and `validate`.

## 0.2.2

### Patch Changes

- d884c0a: Set the VS Code Marketplace extension icon to use the `assets/stego.png` image used in the README.

## 0.2.1

### Patch Changes

- 02f35e6: Remove support for the optional explicit `spine-index.json` file and rely on Spine markdown discovery from `stego-project.json` categories and entry headings. Also adds a README logo image placeholder.

## 0.2.0

### Minor Changes

- a612701: Improve the sidebar workflow with Spine entry labels, inline creation of new spine categories from the Spine tab, and document-tab navigation/history behavior that follows active Markdown files while preserving sidebar-only back/forward history in detached mode.

### Patch Changes

- f951caa: Improve sidebar document/manuscript UX by adding Actions dropdown menus, quoting and italicizing comment anchor excerpts, and keeping the Document tab available with a file link when the active editor is elsewhere.

## 0.1.3

### Patch Changes

- 109cac6: Rename the user-facing "plates" terminology to "spine entries" across the sidebar UI, messages, configuration descriptions, and docs for clearer, more consistent language.

## 0.1.2

### Patch Changes

- 36ef52e: Update extension metadata and sidebar view naming to reflect the current Stego product (not just Spine links).

## 0.1.1

### Patch Changes

- ddd2204: Rewrite the README to document the current Stego MVP, including the Spine entries terminology, sidebar tabs, `stego-project.json` setup, project script hooks, and release workflow.

## 0.1.0

### Minor Changes

- ee3715f: Add Spine multi-pin browsing, manuscript sidebar UX improvements, project config rename to `stego-project.json`, and CI/release automation with Changesets + VS Code Marketplace publishing.

## 0.0.1

- Initial scaffold for Spine identifier links in Markdown.

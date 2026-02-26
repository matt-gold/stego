# Changelog

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

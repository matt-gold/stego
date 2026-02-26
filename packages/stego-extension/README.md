# Stego - VSCode Extension for `stego-cli`

<div align="center">
  <img src="assets/stego.png" alt="Stego logo" width="128" />
</div>

[`stego-cli`](https://github.com/matt-gold/stego-cli) turns VS Code into a writing environment with a structured "spine" knowledge base, resolvable comment threads, and workflow validation built for long-form projects. Stego takes a convention over configuration approach, where source of truth always lives directly in your markdown files and information is linked together automatically.

This extension provides the native UX for stego projects:

- A project-aware sidebar with document, spine, and manuscript-level scope.
- End-to-end UI workflows for Commenting and metadata maintenance.
- Hyperlinks and hover previews automatically appear in the editor wherever identifers are found.
- Project status displays and action buttons for running your project's most important scripts.

## Who is this for?

I created Stego with my own needs in mind. As a software developer by trade, I wanted the security of git-backed drafts, with the power and flexibility of CLI tooling workflows for build and validation that I am familiar with in my coding work. Stego, along with its companion extension [`saurus`](https://github.com/matt-gold/saurus), together give VSCode the lift it needs to be my primary word processor.

## Core Concepts

- **Spine**: Your project reference system (characters, locations, sources, etc.)
  - This idea is sometimes called a "Story Bible" in fiction-oriented apps, but Stego Spine works equally well for glossaries, academic reference tracking, etc.   
- **Spine entry**: A reference entry inside a Spine category (for example `LOC-HOTELDIEU`)
- **Manuscript file**: A Markdown file with frontmatter in your manuscript workflow
- **Project config**: `stego-project.json`, discovered by walking upward from the active file

## Sidebar Overview

Stego adds a **Stego** sidebar panel in the activity bar with a webview UI.

### Document tab

- Contextual panels for the current file (for example TOC in standard Markdown files)
- **Spine Entries** panel when viewing Spine category files (clicking a spine entry opens it in the Spine browser)
- Comments panel with unresolved/resolved threads (when comments are enabled)

### Spine tab

- Project-wide Spine browser (home -> category -> spine entry)
- Back / forward / home navigation
- Multi-pin workflow:
  - Pin a spine entry to keep it visible
  - Continue browsing in a fresh active browser instance below
  - Unpin individual spine entries or unpin all
- "Pin All From File" action to pin all referenced spine entries found in the current Markdown file

### Manuscript tab

- Frontmatter metadata editor
- Status dropdown (project-aware)
- Overview metrics (manuscript files, unresolved comments, etc.)
- Run menu for:
  - **Compile Full Manuscript**
  - **Run Stage Check**
- Status/result cards for stage checks and compile results

## Project Setup

Stego looks for a `stego-project.json` file starting from the active file's directory and walking upward.

### Minimal `stego-project.json`

```json
{
  "name": "My Novel",
  "requiredMetadata": ["status", "chapter", "title"],
  "spineCategories": [
    { "key": "characters", "prefix": "CHAR", "notesFile": "spine/characters.md" },
    { "key": "locations", "prefix": "LOC", "notesFile": "spine/locations.md" },
    { "key": "sources", "prefix": "SRC", "notesFile": "spine/sources.md" }
  ],
  "compileStructure": {
    "levels": [
      { "key": "chapter", "label": "Chapter", "titleKey": "title" }
    ]
  }
}
```

### Supported `stego-project.json` fields (current)

- `title` or `name`
- `requiredMetadata` (array of frontmatter keys)
- `spineCategories[]`
  - `key` (metadata key used in manuscripts)
  - `prefix` (identifier prefix, uppercased internally)
  - `notesFile` (optional path to the Spine category note file)
- `compileStructure.levels[]`
  - `key`
  - `label`
  - `titleKey` (optional)
  - `headingTemplate` (optional, defaults to `{label} {value}: {title}`)

Stego validates this file and reports non-fatal problems instead of failing hard.

## Spine Entry Discovery

Stego discovers Spine entries by scanning your Spine category Markdown files using the prefixes defined in `stego-project.json` (`spineCategories[]`).

Use entry headings for identifiers (for example `## LOC-HOTELDIEU`) and optional inline `label:` metadata for the display name shown in the Spine tab.

## Project Scripts Stego Calls

Stego does not compile manuscripts itself. It runs scripts from the nearest project `package.json`.

### Required scripts by action

- **Run Stage Check**: `check-stage`
- **Compile Full Manuscript**: `build` and `export`
- **Validate Current File**: `validate` and `check-stage`

### Example project `package.json` scripts

```json
{
  "scripts": {
    "build": "node scripts/build-manuscript.js",
    "export": "node scripts/export-manuscript.js",
    "check-stage": "node scripts/check-stage.js",
    "validate": "node scripts/validate-file.js"
  }
}
```

Stego passes arguments for format / stage / file where relevant (for example `--stage`, `--file`, `--format`).

## Comments

- Add comments from the editor with `Cmd+Shift+C` / `Ctrl+Shift+C`
- Unresolved comments are highlighted in the editor and listed in the sidebar
- Comment anchors track edits so comments remain attached to the intended text
- The sidebar supports resolving and clearing resolved threads

## Configuration

### Spine

- `stego.spine.identifierPattern`
- `stego.spine.definitionBaseUrl`
- `stego.spine.reportUnknownIdentifiers`

### Editor

- `stego.editor.enableHover`
- `stego.editor.linkInCodeFences`
- `stego.editor.autoFoldFrontmatter`

### Comments

- `stego.comments.enable`
- `stego.comments.author`

### Optional status list override

If present, Stego reads `stego.config.json` (nearest upward) for:

- `allowedStatuses` (array of strings), used by manuscript status controls and stage-check picker

Default statuses are:

- `draft`
- `revise`
- `line-edit`
- `proof`
- `final`

## Commands

User-facing commands contributed by the extension:

- `Stego Spine: Rebuild Index`
- `Compile Full Manuscript`
- `Run Stage Checks`
- `Validate Current File`
- `Stego Spine: Toggle Frontmatter Fold`
- `Stego: Add Comment`

## Malformed Project Demo

The repo includes a demo workspace that intentionally contains bad data to test hardening behavior:

- `examples/malformed-project`

Open it in VS Code and inspect the Stego sidebar plus the **Stego Project Health** output channel.

## Development

```bash
npm install
npm run compile
npm test
npm run package
```

To debug in VS Code:

1. Open this repo (`stego-extension`)
2. Press `F5` to launch an Extension Development Host

## Release Workflow (Changesets + GitHub Actions)

- CI runs on pushes/PRs to `main`
- Releases are driven by Changesets
- Publishing to the VS Code Marketplace uses the `VSCE_PAT` GitHub Actions secret

Typical contributor flow:

1. Make changes
2. Add a changeset: `npm run changeset`
3. Merge to `main`
4. Let CI + release workflows handle versioning and publish

## License

Apache-2.0. See `LICENSE`.

# Stego - VS Code Extension for `@stego-labs/cli`

<div align="center">
  <img src="assets/stego.png" alt="Stego logo" width="128" />
</div>

[`@stego-labs/cli`](https://github.com/matt-gold/stego/tree/main/packages/stego-cli) turns VS Code into a writing environment for long-form projects. In the current Stego model, authored source lives in `content/` as leaves, and templates compile those leaves into a manuscript.

This extension provides the native UX for Stego projects:

- A project-aware sidebar for working with leaves, metadata, comments, and project status.
- Editor hyperlinks and hover previews for leaf identifiers.
- UI workflows for comments, validation, build, export, and new-leaf creation.
- Project browsing driven by the same content model the CLI and engine use.

## Core Concepts

- **Leaf**: An authored source unit stored under `content/`. A leaf has frontmatter metadata, body text, and a required explicit `id`.
- **Content**: The full collection of leaves loaded from `content/`.
- **Manuscript**: The compiled output document produced by templates.
- **Identifier**: A leaf id such as `CFG-TEMPLATES` or `CH-INTRO`.
- **Template**: Build structure lives in `templates/book.template.tsx`, powered by `@stego-labs/engine`. Templates decide how leaves become a manuscript.
- **Project**: A directory with `stego-project.json`, `content/`, and usually `templates/`.

## Project Setup

Stego looks for a `stego-project.json` file starting from the active file's directory and walking upward. Build structure is not configured in `stego-project.json`; it lives in `templates/book.template.tsx`.

Current project configuration fields:

- `title` or `name`
- `images`

Leaf metadata requirements and defaults come from branch `_branch.md` files via `leafPolicy`.

Legacy `spineCategories` and `compileStructure` are no longer supported.

## Leaf Discovery and Links

The extension indexes leaves from `content/`:

- Markdown and plaintext leaves are scanned recursively.
- Every leaf must define `id:` in frontmatter.
- Inline identifier detection links known ids back to their leaf files.
- Unknown ids can be reported as diagnostics via `stego.links.reportUnknownIdentifiers`.

Templates can also render explicit internal links with `Stego.Link` and leaf-aware renderers like `Stego.Markdown leaf={leaf}`.

## Project Scripts the Extension Calls

The VS Code extension UI delegates build and validation actions to scripts in the nearest project `package.json`.

Preferred scripts by action:

- **New Leaf**: `new`
- **Run Stage Check**: `check-stage`
- **Compile Full Manuscript**: `build` and `export`
- **Validate Current File**: `validate` and `check-stage`

Example:

```json
{
  "scripts": {
    "new": "stego new",
    "build": "stego build",
    "export": "stego export",
    "check-stage": "stego check-stage",
    "validate": "stego validate"
  }
}
```

If a script is missing, the extension falls back to direct `stego` CLI commands when `@stego-labs/cli` is available locally.

## Comments

- Add comments from the editor with `Cmd+Shift+C` / `Ctrl+Shift+C`
- Unresolved comments are highlighted in the editor and listed in the sidebar
- Comment anchors track edits so comments remain attached to the intended text
- The sidebar supports resolving and clearing resolved threads

## Architecture

The extension is organized as feature modules under `src/features/*`.

Key modules:

- `src/features/comments/` comment model/store/decorations + CLI client wiring
- `src/features/metadata/` frontmatter parsing/editing + metadata/image helpers
- `src/features/indexing/` leaf/reference indexes
- `src/features/commands/` command workflows that execute Stego CLI or project scripts
- `src/features/project/` project discovery, config parsing, and file scanning
- `src/features/sidebar/` sidebar provider, runtime, state building, and webview integration

Detailed architecture notes: [`docs/architecture.md`](docs/architecture.md).

## Development

```bash
npm install
npm run compile
npm test
npm run package
```

Useful extension-local commands:

```bash
npm run -w packages/stego-extension compile:host
npm run -w packages/stego-extension compile:webview
npm run -w packages/stego-extension test:pure
npm run -w packages/stego-extension test:webview
```

To debug in VS Code:

1. Open this repo (`stego`)
2. Press `F5` to launch an Extension Development Host

## License

Apache-2.0. See `LICENSE`.

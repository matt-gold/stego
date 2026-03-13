# Stego - VS Code Extension for `@stego/cli`

<div align="center">
  <img src="assets/stego.png" alt="Stego logo" width="128" />
</div>

[`@stego/cli`](https://github.com/matt-gold/stego/tree/main/packages/stego-cli) turns VS Code into a writing environment built for long-form projects. Stego takes a convention over configuration approach, where source of truth always lives directly in your markdown files and information is linked together automatically.

This extension provides the native UX for Stego projects:

- A project-aware sidebar with document, spine, and manuscript-level scope.
- End-to-end UI workflows for Commenting and metadata maintenance.
- Hyperlinks and hover previews automatically appear in the editor wherever identifers are found.
- Project status displays and action buttons for running your project's most important scripts.

## Who is this for?

I created Stego with my own needs in mind. As a software developer by trade, I wanted the security of git-backed drafts, with the power and flexibility of CLI tooling workflows for build and validation that I am familiar with in my coding work. Stego, along with its companion extension [`saurus`](https://github.com/matt-gold/saurus), together give VSCode the lift it needs to be my primary word processor for both creative fiction and technical documentation.

## Core Concepts

- **Spine**: Your project reference system (characters, locations, sources, etc.)
  - This idea is sometimes called a "Story Bible" in fiction-oriented apps, but Stego Spine works equally well for glossaries, academic reference tracking, etc.   
- **Manuscript**: Your manuscript is the ordered set of Markdown files in `manuscript/`. A manuscript file usually holds one scene or section. File-system order is derived from the numeric filename prefix, so names like `100-scene-name.md` and `1200-appendix.md` are both valid.
- **Identifier**: A unique string used for inline references and comments where applicable (for example `CMT-0001`).
- **Template**: Build structure lives in `templates/book.template.tsx`, powered by `@stego/engine`. Templates decide how manuscript and spine records become compiled output.
- **Project**: A directory with a `stego-project.json`, `manuscript/`, and usually `templates/`. VS Code should be opened at the project directory when using the Stego extension.
- **Workspace**: The Stego workspace contains all stego projects and global configuration shared by projects. This provides a monorepo-like workflow to your stego projects when combined with git.

## Project Setup

Stego looks for a `stego-project.json` file starting from the active file's directory and walking upward. Use `@stego/cli` to scaffold a new stego workspace in an empty directory with `npm i -g @stego/cli`, then `stego init`.


### Supported `stego-project.json` fields (current)

- `title` or `name`
- `requiredMetadata` (array of frontmatter keys)
- `images`

Stego validates this file and reports non-fatal problems.

Build structure is not configured in `stego-project.json`. It lives in `templates/book.template.tsx`.

## Spine Entry Discovery

Stego discovers Spine entries from directory structure:

- categories are inferred from `spine/<category>/`
- category metadata lives in `spine/<category>/_category.md`
- entries are markdown files under each category directory (nested files are supported)

Entry metadata uses the same frontmatter format as manuscript files.

## Project Scripts the Extension Calls

The VS Code extension UI delegates build/validate actions to scripts in the nearest project `package.json`.

This is intentional: Stego keeps the sidebar UX and command wiring in the extension, while each project owns the exact workflow (for example custom Pandoc flags, pre/post processing, or other project-specific steps).

In most projects, these scripts are thin wrappers around `@stego/cli` commands.

### Preferred scripts by action

- **New Manuscript**: `new`
- **Run Stage Check**: `check-stage`
- **Compile Full Manuscript**: `build` and `export`
- **Validate Current File**: `validate` and `check-stage`

### Example project `package.json` scripts

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

The extension invokes these scripts with `npm run ...` and passes arguments where relevant.

If a script is missing, the extension falls back to direct `stego` CLI commands when `@stego/cli` is available in your PATH (or via `npx --no-install stego`):

- `new` creates a manuscript file (same as `stego new`)
- `check-stage` receives `--stage ...`
- `export` receives `--format ...`
- `validate` receives `--file ...`
- `Validate Current File` also runs `check-stage -- --stage <status> --file <relative-path>` after `validate`

If you need custom behavior, wrap `@stego/cli` in your own scripts and keep these script names (`new`, `build`, `export`, `check-stage`, `validate`) so the extension can call them directly.

## Comments

- Add comments from the editor with `Cmd+Shift+C` / `Ctrl+Shift+C`
- Unresolved comments are highlighted in the editor and listed in the sidebar
- Comment anchors track edits so comments remain attached to the intended text
- The sidebar supports resolving and clearing resolved threads

## Architecture (Module Layout)

The extension is organized as feature modules under `src/features/*`. The sidebar now uses explicit tab modules:

- `src/features/sidebar/core/`
  - sidebar provider orchestration, refresh loop, command routing, and state integration
- `src/features/sidebar/protocol/`
  - typed host/webview message contracts and runtime payload guards
- `src/features/sidebar/tabs/document/`
  - document-tab TOC, metadata/reference projection, and document-tab state builders
- `src/features/sidebar/tabs/spine/`
  - spine explorer routing, category/item collection, pin state helpers
- `src/features/sidebar/tabs/overview/`
  - overview/manuscript metrics and stage-sorting helpers
- `src/features/sidebar/webview/`
  - host-side webview shell HTML, asset URI wiring, and `SidebarState -> SidebarWebviewState` adaptation
- `webview/sidebar/src/`
  - SolidJS sidebar app modules (`document`, `spine`, `overview`) and webview bridge logic

Other first-class modules:

- `src/features/comments/` comment model/store/decorations + CLI client wiring
- `src/features/metadata/` frontmatter parsing/editing + metadata/image helpers
- `src/features/indexing/` spine/reference indexes
- `src/features/commands/` command workflows that execute Stego CLI/project scripts
- `src/features/project/` project discovery, config parsing, open-mode logic

For contributions, prefer extending an existing module boundary instead of adding cross-cutting logic directly in the provider.
Each non-sidebar feature module now exposes a public API from `src/features/<module>/index.ts`; prefer importing from module entrypoints instead of deep file paths.
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

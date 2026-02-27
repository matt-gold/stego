# Stego - VSCode Extension for `stego-cli`

<div align="center">
  <img src="assets/stego.png" alt="Stego logo" width="128" />
</div>

[`stego-cli`](https://github.com/matt-gold/stego-cli) turns VS Code into a writing environment built for long-form projects. Stego takes a convention over configuration approach, where source of truth always lives directly in your markdown files and information is linked together automatically.

This extension provides the native UX for stego projects:

- A project-aware sidebar with document, spine, and manuscript-level scope.
- End-to-end UI workflows for Commenting and metadata maintenance.
- Hyperlinks and hover previews automatically appear in the editor wherever identifers are found.
- Project status displays and action buttons for running your project's most important scripts.

## Who is this for?

I created Stego with my own needs in mind. As a software developer by trade, I wanted the security of git-backed drafts, with the power and flexibility of CLI tooling workflows for build and validation that I am familiar with in my coding work. Stego, along with its companion extension [`saurus`](https://github.com/matt-gold/saurus), together give VSCode the lift it needs to be my primary word processor for both creative fiction and technical documentation.

## Core Concepts

- **Spine**: Your project reference system (characters, locations, sources, etc.)
  - This idea is sometimes called a "Story Bible" in fiction-oriented apps, but Stego Spine works equally well for glossaries, academic reference tracking, etc.   
- **Manuscript**: Your manuscript consists of all the collection of markdown files in your `/manuscript` directory. A manuscript file usually containing a single scene or section. These get compiled together by the build and can export to multiple doc formats. File system order determines the order these get appended in compilation, so it is recommended to follow the convention `###-scene-name.md` to allow easy reordering.
- **Identifier**: A unique string that creates a structural reference to a metadata or spine entry wherever it appears (for example `CHAR-MARY`, `CMT-001`)
- **Structural Metadata**: special metadata keys that tell the compiler how to append manuscript files during the build. For example, to control how chapter headings and page breaks get inserted in the exported manuscript.
- **Project**: A directory with a `stego-project.json` and `/manuscripts` that can be compiled and result in one document. Vscode should be opened at the project directory when using stego extension.
- **Workspace**: The Stego workspace contains all stego projects and global configuration shared by projects. This provides a monorepo-like workflow to your stego projects when combined with git.

## Project Setup

Stego looks for a `stego-project.json` file starting from the active file's directory and walking upward. Use the stego-cli to scaffold a new stego workspace in an empty directory with `npm i -g stego`, then `stego init`.


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

Stego validates this file and reports non-fatal problems.

## Spine Entry Discovery

Stego discovers Spine entries by scanning your Spine category Markdown files using the prefixes defined in `stego-project.json` (`spineCategories[]`).

Use entry headings for identifiers (for example `## LOC-HOTELDIEU`) and optional inline `label:` metadata for the display name shown in the Spine tab.

## Project Scripts the Extension Calls

The VS Code extension UI delegates build/validate actions to scripts in the nearest project `package.json`.

This is intentional: Stego keeps the sidebar UX and command wiring in the extension, while each project owns the exact workflow (for example custom Pandoc flags, pre/post processing, or other project-specific steps).

In most projects, these scripts are thin wrappers around `stego-cli` commands.

### Required scripts by action

- **Run Stage Check**: `check-stage`
- **Compile Full Manuscript**: `build` and `export`
- **Validate Current File**: `validate` and `check-stage`

### Example project `package.json` scripts

```json
{
  "scripts": {
    "build": "stego build",
    "export": "stego export",
    "check-stage": "stego check-stage",
    "validate": "stego validate"
  }
}
```

The extension invokes these scripts with `npm run ...` and passes arguments where relevant:

- `check-stage` receives `--stage ...`
- `export` receives `--format ...`
- `validate` receives `--file ...`
- `Validate Current File` also runs `check-stage -- --stage <status> --file <relative-path>` after `validate`

If you need custom behavior, wrap `stego-cli` in your own script and keep the script names (`build`, `export`, `check-stage`, `validate`) the same so the extension can call them.

## Comments

- Add comments from the editor with `Cmd+Shift+C` / `Ctrl+Shift+C`
- Unresolved comments are highlighted in the editor and listed in the sidebar
- Comment anchors track edits so comments remain attached to the intended text
- The sidebar supports resolving and clearing resolved threads

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

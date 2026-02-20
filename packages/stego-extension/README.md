# Stego Bible Links

Stego Bible Links turns inline identifiers like `LOC-ASDF` into clickable links in Markdown so writers do not need to manually add Markdown links for every reference.

## Features

- Detect identifiers with a configurable regex (`stego.bible.identifierPattern`)
- Render identifiers as hyperlinks with `DocumentLinkProvider`
- Show definition previews on hover
- Warn when identifiers are missing from your index (`stego.bible.reportUnknownIdentifiers`)
- Ignore fenced code blocks by default
- Auto-build index entries from `project.json` bible category prefixes by scanning `#`/`##`/`###` headings like `CHAR-...`, `LOC-...`, `SRC-...`
- Mode-driven sidebar:
- Manuscript files (`/manuscript` or `/manuscripts`) show a rich metadata editor, with identifier links/previews for bible category keys
- Manuscript files also show TOC when there is more than one heading (H1-H3)
- Non-manuscript files show TOC (H1-H3)
- Bible category note files show backlinks under identifier headings, with filename filtering
- Frontmatter folding support with optional auto-fold on open

## Index Format

Create an index file at `.stego/bible-index.json` (or set `stego.bible.indexFile`).

```json
{
  "LOC-ASDF": {
    "title": "Location Alpha",
    "description": "Primary coastal site used in chapter 3.",
    "url": "https://example.com/bible/LOC-ASDF"
  },
  "LOC-QWER": {
    "title": "Location Q",
    "description": "Secondary fallback location.",
    "path": "docs/bible/location-qwer.md",
    "anchor": "definition"
  },
  "LOC-ZXCV": "Short plain-text definition also supported"
}
```

Each identifier value can be:

- A string (treated as description)
- An object with:
- `title`
- `description`
- `url` (absolute URL target)
- `path` (workspace-relative file path target)
- `anchor` (optional fragment appended to `url` or `path` target)

If the JSON index is missing or incomplete, the extension also infers entries from your nearest `project.json` by reading `bibleCategories[].prefix` and scanning headings in project markdown files.

## Settings

- `stego.bible.identifierPattern`
- `stego.bible.indexFile`
- `stego.bible.definitionBaseUrl`
- `stego.bible.reportUnknownIdentifiers`
- `stego.editor.enableHover`
- `stego.editor.linkInCodeFences`
- `stego.editor.autoFoldFrontmatter`
- `stego.comments.enable`
- `stego.comments.author`

## Sidebar Workflow

1. Open a Markdown file and open the **Stego** activity bar panel.
2. In manuscript files, edit frontmatter metadata directly in the sidebar.
3. If a metadata value under a bible category key contains identifiers, those identifiers render as links with inline previews.
4. In non-manuscript files, use TOC links to navigate headings.
5. In bible category note files, use TOC identifier backlink sections and filter by filename.

## Commands

- `Stego Bible: Rebuild Index`
- `Stego Bible: Toggle Frontmatter Fold`

## Development

```bash
npm install
npm run compile
npm run test:pure
```

Press `F5` in VS Code to run the Extension Development Host.

### Source Layout

- `/Users/mattgold/Code/stego-extension/src/extension.ts`: composition root only (activation, registrations, wiring)
- `/Users/mattgold/Code/stego-extension/src/shared/*`: shared constants, types, and pure helpers
- `/Users/mattgold/Code/stego-extension/src/features/*`: feature modules (project, indexing, metadata, navigation, sidebar, commands)
- `/Users/mattgold/Code/stego-extension/src/test/pure/*`: pure unit tests (no VS Code host dependency)
- `/Users/mattgold/Code/stego-extension/media/sidebar/*`: external webview assets (`sidebar.css`, `sidebar.js`)

### Contribution Rules

- Keep `shared -> features -> extension.ts` dependency direction.
- Keep command IDs, view IDs, and config keys backward-compatible.
- Keep VS Code API usage at the module edges (providers, commands, activation).
- Put webview styles/scripts in `/Users/mattgold/Code/stego-extension/media/sidebar/`, not inline template strings.

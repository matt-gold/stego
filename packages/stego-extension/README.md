# Stego Bible Links

Stego Bible Links turns inline identifiers like `LOC-ASDF` into clickable links in Markdown so writers do not need to manually add Markdown links for every reference.

## Features

- Detect identifiers with a configurable regex (`stegoBible.identifierPattern`)
- Render identifiers as hyperlinks with `DocumentLinkProvider`
- Show definition previews on hover
- Warn when identifiers are missing from your index (`stegoBible.reportUnknownIdentifiers`)
- Ignore fenced code blocks by default
- Auto-build index entries from `project.json` bible category prefixes by scanning `#`/`##`/`###` headings like `CHAR-...`, `LOC-...`, `SRC-...`
- Mode-driven sidebar:
- Manuscript files (`/manuscript` or `/manuscripts`) show a rich metadata editor, with identifier links/previews for bible category keys
- Manuscript files also show TOC when there is more than one heading (H1-H3)
- Non-manuscript files show TOC (H1-H3)
- Bible category note files show backlinks under identifier headings, with filename filtering
- Frontmatter folding support with optional auto-fold on open

## Index Format

Create an index file at `.stego/bible-index.json` (or set `stegoBible.indexFile`).

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

- `stegoBible.identifierPattern`
- `stegoBible.indexFile`
- `stegoBible.definitionBaseUrl`
- `stegoBible.enableHover`
- `stegoBible.reportUnknownIdentifiers`
- `stegoBible.linkInCodeFences`
- `stegoBible.autoFoldFrontmatter`

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
```

Press `F5` in VS Code to run the Extension Development Host.

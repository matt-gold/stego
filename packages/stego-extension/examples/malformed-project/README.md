# Malformed Project Demo

This demo project intentionally contains malformed data to exercise Stego's hardening paths.

## What's broken on purpose

- `stego-project.json` contains invalid field types, duplicate keys/prefixes, and invalid metadata keys.
- `manuscripts/002-frontmatter-list.md` has a YAML list frontmatter root (invalid for Stego).
- `manuscripts/003-bad-yaml.md` has malformed YAML syntax.

## How to test

1. Open this folder as your VS Code workspace:
   - `/Users/mattgold/Code/stego-extension/examples/malformed-project`
2. Open `manuscripts/001-intro.md`.
3. Open the Stego sidebar.
4. In **Document** tab, confirm a warning banner about `stego-project.json` issues.
5. Switch to **Manuscript** (overview) tab, confirm a warning banner that overview skipped malformed files.
6. Open the **Output** panel and select `Stego Project Health` for full diagnostic details.

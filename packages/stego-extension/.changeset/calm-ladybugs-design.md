---
"stego-extension": minor
---

Add a top-header **New Manuscript** action (`+`) and improve manuscript creation flow.

- Adds a new extension command for creating manuscripts from the sidebar header.
- Opens the newly created manuscript in the editor automatically.
- Falls back to direct `stego-cli` commands when expected `package.json` scripts are missing.
- Updates workflow command resolution for `new`, `build`, `export`, `check-stage`, and `validate`.

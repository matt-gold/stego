---
"stego-cli": minor
"stego-extension": minor
---

Ship image support MVP across CLI and extension.

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

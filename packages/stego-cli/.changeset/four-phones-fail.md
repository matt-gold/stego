---
"stego-cli": patch
---

Fix `stego init` for npm-installed CLI usage by writing the scaffold `.gitignore` directly instead of copying a package `.gitignore` asset.

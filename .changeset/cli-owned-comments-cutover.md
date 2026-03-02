---
"stego-cli": patch
"stego-extension": patch
---

Refactor comments to be CLI-owned end-to-end and update extension comment features to use `stego comments` JSON APIs for reads and mutations. This includes canonical comment parsing/serialization in CLI only, nested excerpt rendering fixes, extension comment cache + CLI client integration, and save-time anchor sync/deletion via CLI.

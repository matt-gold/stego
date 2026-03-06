---
"stego-cli": patch
"stego-extension": patch
---

Fix the release workflow packaging step for `stego-extension` so the shared package directory is prepared and copied into the isolated build context before packaging.

Also remove unused placeholder domain files in `stego-cli` as part of the same cleanup.

---
"stego-extension": patch
---

Fix extension release packaging workflow by linking the temporary `node_modules` directory into the runner temp root before VSIX packaging, so shared workspace dependency resolution works in the isolated package step.

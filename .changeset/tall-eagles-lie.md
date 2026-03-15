---
"@stego-labs/shared": patch
"@stego-labs/engine": patch
"@stego-labs/cli": patch
"stego-extension": patch
---

Cut Stego over from the legacy manuscript/spine model to the new content/leaf + branch model, including new `content read` CLI support, branch-aware validation and indexing, updated example projects and docs, the Explore sidebar replacing Spine UI flows, and template/runtime support for leaf-based rendering and linking. This also tightens leaf creation and starter template behavior, improves typed template metadata ergonomics, and documents markdown export as a lower-fidelity compiled artifact rather than a presentation-fidelity target.

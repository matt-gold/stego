---
"@stego-labs/shared": patch
"@stego-labs/engine": patch
"@stego-labs/cli": patch
---

Add an opt-in target-aware template mode for advanced projects, including shared export-target capability contracts, multi-template auto-discovery for build/export, and narrowed Stego authoring types for declared presentation targets. This also enforces declared targets consistently at runtime and on explicit template exports, requires `templates/book.template.tsx` for the default markdown lane, and updates the CLI/engine docs to explain the default versus advanced template workflows.

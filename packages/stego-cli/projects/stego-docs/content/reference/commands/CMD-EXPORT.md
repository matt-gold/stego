---
label: stego export --project <project-id> --format <md|docx|pdf|epub|latex> [--output <path>] [--root <path>]
id: CMD-EXPORT
kind: reference
---

# stego export --project <project-id> --format <md|docx|pdf|epub|latex> [--output <path>] [--root <path>]

- `stego export --project <project-id> --format <md|docx|pdf|epub|latex> [--output <path>] [--root <path>]`
- Export template-driven compiled output to target formats.
- Markdown is a special-case export artifact and stays on the deterministic default template path.
- In advanced template mode, docx/pdf/epub exports use the unique matching discovered template and fail on ambiguity.
- Related workflows: FLOW-BUILD-EXPORT, FLOW-PROOF-RELEASE.
- Related concepts: CON-DIST, CON-TEMPLATE-ENGINE, CON-TARGET-AWARE-TEMPLATES.
- Related integrations: INT-PANDOC, INT-STEGO-ENGINE.

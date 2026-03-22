---
label: stego build --project <project-id> [--root <path>]
id: CMD-BUILD
kind: reference
---

# stego build --project <project-id> [--root <path>]

- `stego build --project <project-id> [--root <path>]`
- In the default lane, compile project sources through `templates/book.template.tsx` into generated markdown output.
- In advanced template mode, auto-discover `templates/*.template.tsx` and write one generated markdown/backend-document artifact pair per template.
- Related workflows: FLOW-BUILD-EXPORT, FLOW-DAILY-WRITING.
- Related concepts: CON-MANUSCRIPT, CON-DIST, CON-TEMPLATE-ENGINE, CON-TARGET-AWARE-TEMPLATES.
- Related configuration: CFG-TEMPLATES, CFG-TEMPLATE-COLLECTIONS.

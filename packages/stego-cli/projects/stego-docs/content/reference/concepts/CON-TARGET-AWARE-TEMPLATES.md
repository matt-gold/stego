---
label: Target-aware templates let advanced projects use multiple templates per project with a narrowed Stego API.
id: CON-TARGET-AWARE-TEMPLATES
kind: reference
---

# Target-aware templates let advanced projects use multiple templates per project with a narrowed Stego API.

- Target-aware templates are the advanced template mode for Stego.
- They use `defineTemplate({ targets: [...] }, (ctx, Stego) => ...)` so the template can declare the presentation targets it supports.
- The `Stego` value inside that callback is a narrowed Stego API based on the strict intersection of the declared presentation targets.
- Multiple templates per project are discovered from `templates/*.template.tsx`.
- `stego build` compiles every discovered template and writes per-template markdown and render-plan artifacts.
- `stego export --format docx|pdf|epub` selects the unique matching discovered template and fails on ambiguity.
- Markdown is a special-case export artifact and stays on the deterministic default template path unless you explicitly bypass it with `--template`.

```text
DEFAULT PROJECT
book.template.tsx
  -> build
  -> export md/docx/pdf/epub

ADVANCED PROJECT
*.template.tsx
  -> discover
  -> read declared targets
  -> build all matching outputs
  -> export single selected target
```

- Related concepts: CON-TEMPLATE-ENGINE.
- Related configuration: CFG-TEMPLATES.
- Related commands: CMD-BUILD, CMD-EXPORT, CMD-TEMPLATE-BUILD, CMD-TEMPLATE-EXPORT.

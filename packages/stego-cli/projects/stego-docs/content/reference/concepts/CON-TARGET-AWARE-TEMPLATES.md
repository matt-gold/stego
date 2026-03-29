---
label: Target-aware templates let advanced projects use multiple templates per project with a narrowed Stego API.
id: CON-TARGET-AWARE-TEMPLATES
kind: reference
---

# Target-aware templates let advanced projects use multiple templates per project with a narrowed Stego API.

- Target-aware templates are the advanced template mode for Stego.
- They use `defineTemplate({ targets: [...] }, (ctx: TemplateContext<...>, Stego) => ...)` so the template can declare the presentation targets it supports.
- The `Stego` value inside that callback is a narrowed Stego API based on the strict intersection of the declared presentation targets.
- This is the right place to build print-oriented templates such as standard manuscript DOCX/PDF layouts that use `bodyStyle`, `headingStyle`, `headingStyles`, `page.size = "letter"`, and scoped `Stego.PageTemplate` wrappers for running heads.
- Print templates can set `bodyStyle.spaceBefore` and `bodyStyle.spaceAfter` on `Stego.Document` or `Stego.Section` to control inherited paragraph spacing for both explicit `Stego.Paragraph` nodes and markdown-authored paragraphs.
- Page templates are structural in V1: `<Stego.PageTemplate>...</Stego.PageTemplate>` applies a running header/footer only to the wrapped subtree.
- Template code can inspect manuscript text with `Stego.getText(...)`, `Stego.getWords(...)`, and related helpers, so target-aware templates can generate analysis outputs as well as presentation outputs.
- `fontFamily` in PDF exports requires `xelatex` so Stego can honor the requested named font reliably. `latex` exports share the same print backend but emit `.tex` directly.
- Multiple templates per project are discovered from `templates/*.template.tsx`.
- `stego build` compiles every discovered template and writes per-template markdown and backend-document artifacts.
- `stego export --format docx|pdf|epub|latex` selects the unique matching discovered template and fails on ambiguity.
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

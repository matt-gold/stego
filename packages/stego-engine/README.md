# @stego-labs/engine

`@stego-labs/engine` is the template-driven document engine for Stego.

It provides four public areas:

- `ir`: the intermediate representation for Stego documents
- `template`: TSX-facing authoring API
- `compile` and `render`: project loading, template evaluation, and Pandoc-oriented render planning

Templates are plain TSX with normal JavaScript. They compile ordered leaves from `content/` into a manuscript.

Stego can emit compiled markdown, but that markdown should be treated as a debug and interchange artifact rather than a full-fidelity presentation target. Richer layout primitives are intended primarily for the DOCX/PDF/EPUB pipeline.

## Template basics

```tsx
import { defineTemplate, Stego } from "@stego-labs/engine";

export default defineTemplate((ctx) => (
  <Stego.Document page={{ size: "6x9", margin: "0.75in" }}>
    <Stego.PageTemplate footer={{ right: <Stego.PageNumber /> }} />
    <Stego.Heading level={1}>{String(ctx.project.metadata.title ?? ctx.project.id)}</Stego.Heading>
    {ctx.content.map((leaf) => (
      <Stego.Markdown leaf={leaf} />
    ))}
  </Stego.Document>
));
```

That default form keeps the full low-friction Stego API and works well for single-template projects.

## Target-aware templates

Advanced template mode narrows the Stego API to the strict intersection of the presentation targets you declare:

```tsx
import { defineTemplate, type TemplateContext } from "@stego-labs/engine";

type ProjectMeta = { title: string };
type LeafMeta = { id: string; chapter?: string };
type BranchMeta = { label?: string };

export default defineTemplate(
  { targets: ["docx", "pdf"] as const },
  (ctx: TemplateContext<ProjectMeta, LeafMeta, BranchMeta>, Stego) => (
    <Stego.Document page={{ size: "6x9", margin: "0.75in" }}>
      <Stego.PageTemplate footer={{ right: <Stego.PageNumber /> }} />
      <Stego.Heading level={1}>{ctx.project.metadata.title}</Stego.Heading>
      {ctx.content.map((leaf) => (
        <Stego.Markdown leaf={leaf} />
      ))}
    </Stego.Document>
  )
);
```

Target-aware templates are meant for advanced template mode and multiple templates per project. They are opt-in. The global `Stego` import stays broad for the default lane.

Markdown is a special-case export artifact. It is still useful for debug, diff, and interchange output, but it does not participate in the strict target-aware type contract the way `docx`, `pdf`, and `epub` do.

`ctx.content` is the full ordered array of leaves loaded from `content/`.

`ctx.branches` exposes the discovered branch tree for directories under `content/`. Every directory is a branch, and `_branch.md` enriches it with `label` and branch notes.

Built-in leaf renderers:

```tsx
<Stego.Markdown source="# Inline markdown" />
<Stego.Markdown leaf={leaf} />
<Stego.PlainText source="Plain text body" />
<Stego.PlainText leaf={leaf} />
```

Internal links target leaf ids by default:

```tsx
<Stego.Link leaf="CFG-TEMPLATES" />
<Stego.Link leaf="CFG-TEMPLATES" heading="Template Collections" />
<Stego.Link leaf="CFG-TEMPLATES">Custom label</Stego.Link>
```

Default link text falls back through:

1. explicit children
2. `leaf.metadata.label`
3. `leaf.metadata.title`
4. `leaf.titleFromFilename`
5. `leaf.id`

## Helpers: `Stego.groupBy()` vs `Stego.splitBy()`

Use `groupBy()` when you want bucketed groups by key regardless of where items appear:

```ts
const references = Stego.groupBy(
  ctx.content.filter((leaf) => leaf.metadata.kind === "reference"),
  (leaf) => typeof leaf.metadata.kind === "string" ? leaf.metadata.kind : undefined
);
```

Use `splitBy()` when you want contiguous groups in the current order:

```ts
const chapters = Stego.splitBy(
  ctx.content,
  (leaf) => typeof leaf.metadata.chapter === "string" ? leaf.metadata.chapter : undefined
);
```

`Stego.splitBy()` preserves order and starts a new group each time the selected value changes. Missing values inherit the current open group, so only boundary leaves need the grouping metadata.

## Layout primitives

Stego currently exposes portable layout controls such as:

- `spaceBefore` / `spaceAfter`
- `insetLeft` / `insetRight`
- `firstLineIndent`
- `align`
- `Stego.KeepTogether`
- `Stego.PageBreak`

These lower into the render plan and are supported across the main Stego targets, including DOCX.

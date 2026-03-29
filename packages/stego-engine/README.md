# @stego-labs/engine

`@stego-labs/engine` is the template-driven document engine for Stego.

It provides four public areas:

- `ir`: the intermediate representation for Stego documents
- `template`: TSX-facing authoring API
- `compile` and `render`: project loading, template evaluation, and Pandoc-oriented backend document generation

Templates are plain TSX with normal JavaScript. They compile ordered leaves from `content/` into manuscripts, reports, reference appendices, and other derived documents.

Stego can emit compiled markdown, but that markdown is best understood as an inspection and interchange artifact. It shows the resolved document structure in a portable text form, but richer layout primitives are meant for the DOCX/PDF/EPUB/LaTeX export pipeline.

## Template basics

```tsx
import { defineTemplate, Stego } from "@stego-labs/engine";

export default defineTemplate((ctx) => (
  <Stego.Document page={{ size: "6x9", margin: "0.75in" }}>
    <Stego.PageTemplate footer={{ right: <Stego.PageNumber /> }}>
      <Stego.Heading level={1}>{String(ctx.project.metadata.title ?? ctx.project.id)}</Stego.Heading>
      {ctx.allLeaves.map((leaf) => (
        <Stego.Markdown leaf={leaf} />
      ))}
    </Stego.PageTemplate>
  </Stego.Document>
));
```

That default form keeps the low-friction API and works well for single-template projects.

The important idea is that the template is just code over manuscript data:

- `ctx.content` is the content tree
- `ctx.allLeaves` is the full ordered flat list of leaves
- `ctx.allBranches` is the flat list of discovered branches
- your template decides what to render, how to group it, and what output shape to create

## Target-aware templates

Advanced template mode narrows the Stego API to the strict intersection of the presentation targets you declare:

```tsx
import { defineTemplate, type TemplateContext } from "@stego-labs/engine";

type ProjectMeta = { title: string };
type LeafMeta = { id: string; chapter?: string };
type BranchMeta = { label?: string };

export default defineTemplate(
  { targets: ["docx", "pdf"] },
  (ctx: TemplateContext<LeafMeta, BranchMeta, ProjectMeta>, Stego) => (
    <Stego.Document
      page={{ size: "letter", margin: "1in" }}
      bodyStyle={{
        fontFamily: "Times New Roman",
        fontSize: "12pt",
        lineSpacing: 2,
        spaceBefore: 0,
        spaceAfter: 0,
      }}
    >
      <Stego.Heading level={1}>{ctx.project.metadata.title}</Stego.Heading>
      {ctx.allLeaves.map((leaf) => (
        <Stego.Section bodyStyle={{ firstLineIndent: "0.5in" }}>
          <Stego.Markdown leaf={leaf} />
        </Stego.Section>
      ))}
    </Stego.Document>
  )
);
```

Target-aware templates are meant for advanced template mode and multiple templates per project. They are opt-in. The global `Stego` import stays broad for the default lane.

If you do not need explicit metadata typing, omit the callback annotation too:

```tsx
export default defineTemplate(
  { targets: ["docx", "pdf"] },
  (ctx, Stego) => (
    <Stego.Document page={{ size: "6x9", margin: "0.75in" }} />
  )
);
```

Markdown is a special-case export artifact. It is still useful for inspection, diffing, and lightweight handoff, but it does not participate in the strict target-aware type contract the way `docx`, `pdf`, `latex`, and `epub` do.

## Content model

`ctx.content` is the root content tree loaded from `content/`.

- `ctx.content.leaves` are the direct leaves under `content/`
- `ctx.content.branches` are the top-level branches under `content/`
- nested branches continue through `branch.branches`

`ctx.allLeaves` is the full ordered flat leaf list.

`ctx.allBranches` is the flat list of discovered branches under `content/`, including the root branch with `id === ""`. Every directory is a branch, and `_branch.md` enriches it with `label`, optional inheritable `leafPolicy`, and branch notes.

Branch and leaf relationships are exposed directly:

- `branch.id` is the structural branch id such as `reference/characters`
- `branch.parentId` points to the containing branch
- `branch.leaves` contains the direct leaves in that branch
- `leaf.branchId` points back to the containing branch

Built-in leaf renderers:

```tsx
<Stego.Markdown source="# Inline markdown" />
<Stego.Markdown leaf={leaf} />
<Stego.PlainText source="Plain text body" />
<Stego.PlainText leaf={leaf} />
```

`Stego.Markdown` now expands into block-aware internal IR before rendering:

- paragraphs become paragraph-like markdown blocks
- ATX headings become heading-like markdown blocks
- complex blocks such as lists, blockquotes, code fences, and tables stay opaque in V1

That means markdown paragraphs now participate in paragraph spacing defaults instead of bypassing Stego layout semantics entirely.

Markdown also supports a small Stego-owned directive surface for block- and inline-level layout hints:

```md
Best regards,

<stego-spacer lines="3" />

Jane Doe
```

```md
Very <stego-span font-weight="bold" underline>important</stego-span> text.
```

In V1:

- `<stego-spacer />` is block-only and must be self-closing
- `<stego-span>...</stego-span>` is inline-only and must use paired syntax
- `stego-spacer` supports:
  - `lines="N"`
- `stego-span` supports:
  - `font-family="..."`
  - `font-size="12pt"`
  - `font-weight="normal|bold"`
  - `italic`
  - `italic="true|false"`
  - `underline`
  - `underline="true|false"`
  - `small-caps`
  - `small-caps="true|false"`
  - `color="#RRGGBB"`
- non-boolean directive attrs use quoted HTML-style syntax
- bare boolean attrs on `stego-span` mean `true`
- repeated blank lines in markdown still do not acquire special spacing semantics

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

## Scoped page templates

`Stego.PageTemplate` is now a scoped wrapper, not a global document toggle.

Use it when a running header or footer should apply only to one part of the document:

```tsx
<Stego.Document>
  <Stego.Section id="title-page">
    <Stego.Paragraph align="center">Funny Business</Stego.Paragraph>
  </Stego.Section>

  <Stego.PageBreak />

  <Stego.PageTemplate
    header={{
      left: "Gold",
      center: "FUNNY BUSINESS",
      right: <Stego.PageNumber />,
    }}
  >
    {ctx.allLeaves.map((leaf) => (
      <Stego.Markdown leaf={leaf} />
    ))}
  </Stego.PageTemplate>
</Stego.Document>
```

This makes page-template behavior follow document structure:

- content before the wrapper gets no running head from that template
- content inside the wrapper gets the configured header/footer
- later wrappers can introduce different page styles for other sections

Page-template regions accept:

- text
- `Stego.Span`
- `Stego.PageNumber`

They do not accept links or arbitrary block content in V1.

## Helpers: `Stego.groupBy()` vs `Stego.splitBy()`

Use `groupBy()` when you want bucketed groups by key regardless of where items appear:

```ts
const references = Stego.groupBy(
  ctx.allLeaves.filter((leaf) => leaf.metadata.kind === "reference"),
  (leaf) => typeof leaf.metadata.kind === "string" ? leaf.metadata.kind : undefined
);
```

Use `splitBy()` when you want contiguous groups in the current order:

```ts
const chapters = Stego.splitBy(
  ctx.allLeaves,
  (leaf) => typeof leaf.metadata.chapter === "string" ? leaf.metadata.chapter : undefined
);
```

`Stego.splitBy()` preserves order and starts a new group each time the selected value changes. Missing values inherit the current open group, so only boundary leaves need the grouping metadata.

## Manuscript text APIs

Templates are not limited to rendering. They can inspect manuscript text directly.

Stego exposes four analysis helpers:

- `Stego.getText(...)`
- `Stego.getTextTokens(...)`
- `Stego.getWords(...)`
- `Stego.getWordCount(...)`

These helpers accept strings, leaves, or arrays of leaves and use Stego's markdown-aware text extraction rather than a naive whitespace split.

```tsx
const chapterLeaves = ctx.allLeaves.filter(
  (leaf) => leaf.relativePath.startsWith("manuscript/")
);

const wordCount = Stego.getWordCount(chapterLeaves);
const words = Stego.getWords(chapterLeaves);
const text = Stego.getText(chapterLeaves);
```

`getTextTokens(...)` is the low-level form. It preserves punctuation and spacing as tokens:

- `{ kind: "word", value: "Hello" }`
- `{ kind: "punct", value: "," }`
- `{ kind: "space", value: " " }`
- `{ kind: "newline", value: "\n" }`

That makes it possible to build template-driven analysis outputs such as word-frequency reports, manuscript stats pages, or custom QA templates without leaving the Stego template layer.

## Layout primitives

Stego currently exposes portable layout controls such as:

- `spaceBefore` / `spaceAfter`
- `insetLeft` / `insetRight`
- `firstLineIndent`
- `align`
- `fontFamily`
- `fontSize`
- `lineSpacing`
- `headingStyle` / `headingStyles`
- `bodyStyle`
- `Stego.KeepTogether`
- `Stego.PageBreak`
- `Stego.Spacer`
- `Stego.Span`

Template-side spacing and inline styling use the JSX components:

```tsx
<Stego.Paragraph>
  Very <Stego.Span fontWeight="bold" underline>important</Stego.Span> text.
</Stego.Paragraph>

<Stego.Spacer lines={2} />
```

`Stego.Spacer`:

- inserts explicit blank vertical space
- defaults to `lines={1}`
- supports optional `fontSize` and `lineSpacing` overrides

`Stego.Span`:

- is the general inline styling component
- supports:
  - `fontFamily`
  - `fontSize`
  - `fontWeight`
  - `italic`
  - `underline`
  - `smallCaps`
  - `color`
- works in paragraphs, headings, links, and page-template header/footer regions

Style support is target-aware:

- `docx`: full block styling
- `pdf`: full block styling
- `latex`: full block styling
- `epub`: safe subset, including spacing, indent, align, font size, line spacing, and heading emphasis/color

PDF exports that request `fontFamily` require `xelatex` so named fonts can be honored reliably. Some font features, such as small caps or italic small caps, are also font-dependent in the LaTeX/PDF path.

Paragraph spacing defaults are inherited:

- `Document.bodyStyle.spaceBefore` / `Document.bodyStyle.spaceAfter` set defaults for descendant paragraphs
- `Section.bodyStyle.spaceBefore` / `Section.bodyStyle.spaceAfter` override those defaults for that subtree
- `Paragraph.spaceBefore` / `Paragraph.spaceAfter` are explicit per-paragraph overrides

When omitted, Stego treats paragraph spacing defaults as `0` before and `0` after. This keeps manuscript-style DOCX output from inheriting Word's built-in paragraph gap unless the template asks for one.

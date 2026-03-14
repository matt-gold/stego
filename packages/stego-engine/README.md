# @stego-labs/engine

`@stego-labs/engine` is the template-driven document engine for Stego.

It provides four public areas:

- `ir`: the intermediate representation for Stego documents
- `collections`: generic query/grouping helpers for template data
- `template`: TSX-facing authoring API and template loading
- `compile` and `render`: project loading, template evaluation, and Pandoc-oriented render planning

Templates are plain TSX with normal JavaScript. They compose built-in `Stego.*` components and compile into Stego IR, which the render layer lowers into a Pandoc-oriented render plan.

V1 intentionally does not expose backend-specific escape hatches, arbitrary CSS, or a plugin API.

## Template basics

Templates default-export `defineTemplate(...)` from a `.tsx` file:

```tsx
import { defineTemplate, Stego } from "@stego-labs/engine";

export default defineTemplate((ctx) => (
  <Stego.Document page={{ size: "6x9", margin: "0.75in" }}>
    <Stego.PageTemplate footer={{ right: <Stego.PageNumber /> }} />
    <Stego.Heading level={1}>
      {String(ctx.project.metadata.title ?? ctx.project.id)}
    </Stego.Heading>
    {ctx.collections.manuscripts.map((doc) => (
      <Stego.Markdown source={doc.body} />
    ))}
  </Stego.Document>
));
```

Templates use normal JavaScript control flow inside TSX. There is no Stego-specific control-flow DSL in V1.

For VS Code and TypeScript language-server support, put template files in a TS project with:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "types": ["node"],
    "jsx": "react-jsx",
    "jsxImportSource": "@stego-labs/engine"
  },
  "include": ["templates/**/*.tsx"]
}
```

The TypeScript server also needs to be able to resolve `@stego-labs/engine`, either from `node_modules` or a local link during development.

For block spacing, use `spaceBefore` / `spaceAfter`. For horizontally inset blocks such as custom pull quotes or blockquote-style wrappers, use `insetLeft` / `insetRight`. For fiction-style paragraph indentation, use `firstLineIndent` at the section or paragraph level.

```tsx
function PullQuote(props: { children?: unknown }) {
  return (
    <Stego.Section insetLeft="24pt" insetRight="24pt" spaceBefore={18} spaceAfter={18}>
      <Stego.Paragraph align="center">{props.children}</Stego.Paragraph>
    </Stego.Section>
  );
}

function ChapterBody(props: { children?: unknown }) {
  return (
    <Stego.Section firstLineIndent="1.5em">
      {props.children}
    </Stego.Section>
  );
}

function KeptHeading(props: { title: string; children?: unknown }) {
  return (
    <Stego.KeepTogether>
      <Stego.Heading level={2}>{props.title}</Stego.Heading>
      {props.children}
    </Stego.KeepTogether>
  );
}
```

`Stego.KeepTogether` is a best-effort layout wrapper for short block groups such as a heading plus its opening paragraph, an image plus caption, or a compact epigraph. It maps to a keep-together block in supported render targets rather than forcing templates to manage layout hacks directly.

## Collections: `groupBy()` vs `splitBy()`

`ctx.collections.*` exposes immutable collection helpers for ordered project content.

Use `groupBy()` when you want bucketed groups by key, regardless of where matching items appear:

```ts
const groups = ctx.collections.spineEntries.groupBy("category");
```

Use `splitBy()` when you want contiguous groups in the current order:

```ts
const chapters = ctx.collections.manuscripts.splitBy("chapter");
```

`splitBy()` preserves order and starts a new group each time the selected value changes. Repeated values later in the stream create a new group.

Missing values inherit the current open group instead of breaking it, so only files that start a new boundary need to specify the boundary metadata.

Example:

```ts
["1", "1", null, "2", "2", null, "1"]
```

becomes:

```ts
[["1", "1", null], ["2", "2", null], ["1"]]
```

If the sequence starts with `undefined`, `null`, or blank values, those leading items form a leading ungrouped segment with `group.value === undefined`.

This makes `splitBy()` the right primitive for ordered document structure such as chapters, parts, or appendix sections.

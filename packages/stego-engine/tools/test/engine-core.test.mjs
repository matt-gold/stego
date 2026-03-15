import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..", "..");
const engine = await import(pathToFileURL(path.join(packageRoot, "src", "index.ts")).href);

test("Stego.groupBy buckets selector-based values", () => {
  const groups = engine.Stego.groupBy([
    { metadata: { chapter: "1" }, title: "A" },
    { metadata: { chapter: "1" }, title: "B" },
    { metadata: { chapter: "2" }, title: "C" }
  ], (item) => typeof item.metadata.chapter === "string" ? item.metadata.chapter : undefined);

  assert.equal(groups.length, 2);
  assert.equal(groups[0].value, "1");
  assert.equal(groups[0].items.length, 2);
});

test("Stego.splitBy preserves a leading ungrouped segment, inherits missing values, and splits contiguous runs", () => {
  const groups = engine.Stego.splitBy([
    { metadata: {}, title: "Prelude" },
    { metadata: { chapter: "1", chapter_title: "One" }, title: "A" },
    { metadata: {}, title: "B" },
    { metadata: { chapter: "2", chapter_title: "Two" }, title: "C" },
    { metadata: {}, title: "D" },
    { metadata: { chapter: "1", chapter_title: "One returns" }, title: "E" }
  ], (item) => typeof item.metadata.chapter === "string" ? item.metadata.chapter : undefined);

  assert.equal(groups.length, 4);
  assert.equal(groups[0].value, undefined);
  assert.equal(groups[0].items.length, 1);
  assert.equal(groups[0].first.title, "Prelude");
  assert.equal(groups[1].value, "1");
  assert.equal(groups[1].items.length, 2);
  assert.equal(groups[1].first.metadata.chapter_title, "One");
  assert.equal(groups[2].value, "2");
  assert.equal(groups[2].items.length, 2);
  assert.equal(groups[3].value, "1");
  assert.equal(groups[3].items.length, 1);
  assert.equal(groups[3].first.title, "E");
});

test("TSX helpers create document IR through defineTemplate", () => {
  const template = engine.defineTemplate((ctx) => (
    engine.Stego.Document({
      children: [
        engine.Stego.Heading({ level: 1, children: String(ctx.project.metadata.title) }),
        engine.Stego.Paragraph({ children: "Body" })
      ]
    })
  ));

  const document = template.render({
    project: { id: "demo", root: "/tmp/demo", metadata: { title: "Demo" } },
    content: [],
    branches: []
  });

  assert.equal(document.kind, "document");
  assert.equal(document.children[0].kind, "heading");
});

test("target-aware templates reject unsupported runtime capabilities", () => {
  const template = engine.defineTemplate(
    { targets: ["epub"] },
    (_ctx, NarrowStego) => NarrowStego.Document({
      children: [
        engine.Stego.PageTemplate({
          footer: { right: engine.Stego.PageNumber() }
        })
      ]
    })
  );

  assert.throws(() => engine.evaluateTemplate(template, {
    project: { id: "demo", root: "/tmp/demo", metadata: {} },
    content: [],
    branches: []
  }), /declared targets \(epub\) do not all support/i);
});

test("defineTemplate rejects empty and duplicate target declarations", () => {
  assert.throws(() => engine.defineTemplate(
    { targets: [] },
    () => engine.Stego.Document({ children: [] })
  ), /one or more presentation targets/i);

  assert.throws(() => engine.defineTemplate(
    { targets: ["pdf", "pdf"] },
    () => engine.Stego.Document({ children: [] })
  ), /may not declare duplicate presentation targets/i);
});

test("evaluateTemplate rejects empty in-memory target declarations", () => {
  const template = {
    kind: "stego-template",
    targets: [],
    render: () => engine.Stego.Document({ children: [] })
  };

  assert.throws(() => engine.evaluateTemplate(template, {
    project: { id: "demo", root: "/tmp/demo", metadata: {} },
    content: [],
    branches: []
  }), /one or more presentation targets/i);
});

test("compileProject loads leaves, excludes _branch.md from content, and builds branches", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stego-engine-"));
  try {
    fs.mkdirSync(path.join(tempDir, "content", "reference", "characters"), { recursive: true });
    fs.mkdirSync(path.join(tempDir, "templates"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "stego-project.json"), `${JSON.stringify({ id: "demo", title: "Demo" }, null, 2)}\n`);
    fs.writeFileSync(
      path.join(tempDir, "content", "_branch.md"),
      `---\nlabel: Book Content\n---\n\nRoot branch notes.\n`
    );
    fs.writeFileSync(
      path.join(tempDir, "content", "reference", "characters", "_branch.md"),
      `---\nlabel: Characters\n---\n\nCharacter notes.\n`
    );
    fs.writeFileSync(
      path.join(tempDir, "content", "100-scene.md"),
      `---\nid: CH-ONE\nstatus: revise\nchapter: 1\nchapter_title: One\n---\n\n## Opening\n\nBody.\n\n<!-- stego-comments:start -->\n\n<!-- comment: CMT-0001 -->\n<!-- meta64: eyJzdGF0dXMiOiJvcGVuIn0= -->\n> _Mar 1, 2026, 6:31 AM - matt_\n>\n> Note\n\n<!-- stego-comments:end -->\n`
    );
    fs.writeFileSync(
      path.join(tempDir, "content", "reference", "characters", "CHAR-ONE.md"),
      `---\nid: CHAR-ONE\nkind: reference\n---\n\n# Character\n\nA note.\n`
    );
    fs.writeFileSync(
      path.join(tempDir, "templates", "book.template.tsx"),
      `import { defineTemplate, Stego } from "@stego-labs/engine";
export default defineTemplate((ctx) => (
  <Stego.Document>
    {ctx.content.map((leaf) => (
      <Stego.Markdown leaf={leaf} />
    ))}
  </Stego.Document>
));
`
    );

    const compiled = await engine.compileProject({ projectRoot: tempDir });
    const rendered = engine.renderDocument({ document: compiled.document, projectRoot: tempDir, context: compiled.context });

    assert.equal(Array.isArray(compiled.context.content), true);
    assert.equal(Array.isArray(compiled.context.branches), true);
    assert.equal(compiled.context.content.length, 2);
    assert.equal(compiled.context.content.some((leaf) => leaf.relativePath.endsWith("_branch.md")), false);
    assert.equal(compiled.context.branches.some((branch) => branch.key === "" && branch.label === "Book Content"), true);
    assert.equal(compiled.context.branches.some((branch) => branch.key === "reference/characters" && branch.label === "Characters"), true);

    assert.match(rendered.markdown, /Body\./);
    assert.doesNotMatch(rendered.markdown, /CMT-0001/);
    assert.match(rendered.markdown, /#CH-ONE/);
    assert.match(rendered.markdown, /CH-ONE--opening/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("renderDocument emits keep-together, layout, footer page-number metadata, and image attrs", () => {
  const document = engine.Stego.Document({
    page: { size: "6x9", margin: "0.75in" },
    children: [
      engine.Stego.PageTemplate({ footer: { right: engine.Stego.PageNumber() } }),
      engine.Stego.PageBreak(),
      engine.Stego.KeepTogether({
        children: [
          engine.Stego.Heading({ level: 2, children: "Kept heading" }),
          engine.Stego.Paragraph({ children: "Kept paragraph" })
        ]
      }),
      engine.Stego.Section({
        insetLeft: "24pt",
        insetRight: "24pt",
        spaceBefore: 18,
        spaceAfter: 12,
        firstLineIndent: "1.5em",
        children: [
          engine.Stego.Heading({ level: 2, spaceBefore: 24, spaceAfter: 18, children: "Inset heading" }),
          engine.Stego.Paragraph({ align: "center", firstLineIndent: "2em", children: "Inset paragraph" })
        ]
      }),
      engine.Stego.Image({
        src: "assets/maps/city-plan.svg",
        alt: "Map",
        width: "65%",
        layout: "block",
        align: "center"
      })
    ]
  });

  const rendered = engine.renderDocument({
    document,
    projectRoot: "/tmp/demo",
    context: {
      project: { id: "demo", root: "/tmp/demo", metadata: {} },
      content: [],
      branches: []
    }
  });
  assert.equal(rendered.backend, "pandoc");
  assert.equal(rendered.inputFormat, "markdown-implicit_figures");
  assert.match(rendered.markdown, /data-page-break=true/);
  assert.match(rendered.markdown, /data-keep-together=true/);
  assert.match(rendered.markdown, /data-space-before=18pt/);
  assert.match(rendered.markdown, /data-space-after=12pt/);
  assert.match(rendered.markdown, /data-inset-left=24pt/);
  assert.match(rendered.markdown, /data-inset-right=24pt/);
  assert.match(rendered.markdown, /data-first-line-indent=1.5em/);
  assert.match(rendered.markdown, /data-first-line-indent=2em/);
  assert.match(rendered.markdown, /data-layout=block/);
  assert.deepEqual(rendered.requiredFilters, ["image-layout", "block-layout"]);
  assert.equal(Array.isArray(rendered.postprocess.docx.blockLayouts), true);
  assert.equal(rendered.postprocess.docx.blockLayouts.length >= 4, true);
  assert.equal(rendered.postprocess.docx.blockLayouts.some((entry) => entry.keepTogether === true), true);
  assert.equal(
    rendered.postprocess.docx.blockLayouts.some((entry) => entry.spaceBefore === "18pt" && entry.firstLineIndent === "1.5em"),
    true
  );
  assert.equal(
    rendered.postprocess.docx.blockLayouts.some((entry) => entry.spaceBefore === "24pt" && entry.spaceAfter === "18pt"),
    true
  );
  assert.equal(
    rendered.postprocess.docx.blockLayouts.some((entry) => entry.align === "center" && !entry.spaceBefore && !entry.keepTogether),
    true
  );
  assert.equal(rendered.postprocess.docx.blockLayouts.some((entry) => entry.pageBreak === true), true);
  assert.ok(Array.isArray(rendered.metadata["header-includes"]));
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..", "..");
const engine = await import(pathToFileURL(path.join(packageRoot, "src", "index.ts")).href);

test("createCollection groups metadata-backed values", () => {
  const collection = engine.createCollection([
    { metadata: { chapter: "1" }, title: "A" },
    { metadata: { chapter: "1" }, title: "B" },
    { metadata: { chapter: "2" }, title: "C" }
  ]);

  const groups = collection.groupBy("chapter");
  assert.equal(groups.length, 2);
  assert.equal(groups[0].value, "1");
  assert.equal(groups[0].items.length, 2);
});

test("createCollection splitBy preserves a leading ungrouped segment, inherits missing values, and splits contiguous runs", () => {
  const collection = engine.createCollection([
    { metadata: {}, title: "Prelude" },
    { metadata: { chapter: "1", chapter_title: "One" }, title: "A" },
    { metadata: {}, title: "B" },
    { metadata: { chapter: "2", chapter_title: "Two" }, title: "C" },
    { metadata: {}, title: "D" },
    { metadata: { chapter: "1", chapter_title: "One returns" }, title: "E" }
  ]);

  const groups = collection.splitBy("chapter");
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
    collections: {
      manuscripts: engine.createCollection([]),
      spineEntries: engine.createCollection([]),
      spineCategories: engine.createCollection([])
    }
  });

  assert.equal(document.kind, "document");
  assert.equal(document.children[0].kind, "heading");
});

test("compileProject loads template and strips comments from manuscript body", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stego-engine-"));
  try {
    fs.mkdirSync(path.join(tempDir, "manuscript"), { recursive: true });
    fs.mkdirSync(path.join(tempDir, "spine", "sources"), { recursive: true });
    fs.mkdirSync(path.join(tempDir, "templates"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "stego-project.json"), `${JSON.stringify({ id: "demo", title: "Demo" }, null, 2)}\n`);
    fs.writeFileSync(path.join(tempDir, "spine", "sources", "_category.md"), "---\nlabel: Sources\n---\n");
    fs.writeFileSync(path.join(tempDir, "spine", "sources", "SRC-ONE.md"), "# Source One\n\nFact.\n");
    fs.writeFileSync(
      path.join(tempDir, "manuscript", "100-scene.md"),
      `---\nstatus: revise\nchapter: 1\nchapter_title: One\n---\n\nBody.\n\n<!-- stego-comments:start -->\n\n<!-- comment: CMT-0001 -->\n<!-- meta64: eyJzdGF0dXMiOiJvcGVuIn0= -->\n> _Mar 1, 2026, 6:31 AM - matt_\n>\n> Note\n\n<!-- stego-comments:end -->\n`
    );
    fs.writeFileSync(
      path.join(tempDir, "templates", "book.template.tsx"),
      `import { defineTemplate, Stego } from "@stego-labs/engine";
export default defineTemplate((ctx) => (
  <Stego.Document>
    {ctx.collections.manuscripts.map((doc) => (
      <Stego.Markdown source={doc.body} />
    ))}
  </Stego.Document>
));
`
    );

    const compiled = await engine.compileProject({ projectRoot: tempDir });
    const rendered = engine.renderDocument({ document: compiled.document, projectRoot: tempDir });

    assert.match(rendered.markdown, /Body\./);
    assert.doesNotMatch(rendered.markdown, /CMT-0001/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("renderDocument emits footer page-number metadata and image attrs", () => {
  const document = engine.Stego.Document({
    page: { size: "6x9", margin: "0.75in" },
    children: [
      engine.Stego.PageTemplate({ footer: { right: engine.Stego.PageNumber() } }),
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

  const rendered = engine.renderDocument({ document, projectRoot: "/tmp/demo" });
  assert.equal(rendered.backend, "pandoc");
  assert.equal(rendered.inputFormat, "markdown-implicit_figures");
  assert.match(rendered.markdown, /data-space-before=18pt/);
  assert.match(rendered.markdown, /data-space-after=12pt/);
  assert.match(rendered.markdown, /data-inset-left=24pt/);
  assert.match(rendered.markdown, /data-inset-right=24pt/);
  assert.match(rendered.markdown, /data-first-line-indent=1.5em/);
  assert.match(rendered.markdown, /data-first-line-indent=2em/);
  assert.match(rendered.markdown, /data-layout=block/);
  assert.deepEqual(rendered.requiredFilters, ["image-layout", "block-layout"]);
  assert.ok(Array.isArray(rendered.metadata["header-includes"]));
});

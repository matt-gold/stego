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
    content: { kind: "content", name: "content", label: "Content", relativeDir: "content", metadata: {}, leaves: [], branches: [] },
    allLeaves: [],
    allBranches: []
  });

  assert.equal(document.kind, "document");
  assert.equal(document.children[0].kind, "heading");
});

test("target-aware templates reject unsupported runtime capabilities", () => {
  const template = engine.defineTemplate(
    { targets: ["epub"] },
    (_ctx, NarrowStego) => NarrowStego.Document({
      bodyStyle: {
        fontFamily: "Times New Roman"
      },
      children: [
        engine.Stego.PageTemplate({
          footer: { right: engine.Stego.PageNumber() }
        })
      ]
    })
  );

  assert.throws(() => engine.evaluateTemplate(template, {
    project: { id: "demo", root: "/tmp/demo", metadata: {} },
    content: { kind: "content", name: "content", label: "Content", relativeDir: "content", metadata: {}, leaves: [], branches: [] },
    allLeaves: [],
    allBranches: []
  }), /declared targets \(epub\) do not all support/i);
});

test("target-aware templates reject invalid heading colors", () => {
  const template = engine.defineTemplate(
    { targets: ["docx", "pdf"] },
    (_ctx, PrintStego) => PrintStego.Document({
      headingStyle: {
        color: "red"
      },
      children: [PrintStego.Heading({ level: 1, children: "Body" })]
    })
  );

  assert.throws(() => engine.evaluateTemplate(template, {
    project: { id: "demo", root: "/tmp/demo", metadata: {} },
    content: { kind: "content", name: "content", label: "Content", relativeDir: "content", metadata: {}, leaves: [], branches: [] },
    allLeaves: [],
    allBranches: []
  }), /hex color/i);
});

test("defineTemplate accepts latex as a presentation target", () => {
  const template = engine.defineTemplate(
    { targets: ["latex"] },
    (_ctx, LatexStego) => LatexStego.Document({ children: [LatexStego.Paragraph({ children: "Body" })] })
  );

  const document = engine.evaluateTemplate(template, {
    project: { id: "demo", root: "/tmp/demo", metadata: {} },
    content: { kind: "content", name: "content", label: "Content", relativeDir: "content", metadata: {}, leaves: [], branches: [] },
    allLeaves: [],
    allBranches: []
  });

  assert.equal(document.kind, "document");
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
    content: { kind: "content", name: "content", label: "Content", relativeDir: "content", metadata: {}, leaves: [], branches: [] },
    allLeaves: [],
    allBranches: []
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
    {ctx.allLeaves.map((leaf) => (
      <Stego.Markdown leaf={leaf} />
    ))}
  </Stego.Document>
));
`
    );

    const compiled = await engine.compileProject({ projectRoot: tempDir });
    const rendered = engine.renderDocument({ document: compiled.document, projectRoot: tempDir, context: compiled.context });

    assert.equal(Array.isArray(compiled.context.content.leaves), true);
    assert.equal(Array.isArray(compiled.context.content.branches), true);
    assert.equal(Array.isArray(compiled.context.allLeaves), true);
    assert.equal(Array.isArray(compiled.context.allBranches), true);
    assert.equal(compiled.context.allLeaves.length, 2);
    assert.equal(compiled.context.allLeaves.some((leaf) => leaf.relativePath.endsWith("_branch.md")), false);
    assert.equal(compiled.context.content.label, "Book Content");
    assert.equal(compiled.context.allBranches.some((branch) => branch.id === "" && branch.label === "Book Content"), true);
    assert.equal(compiled.context.allBranches.some((branch) => branch.id === "reference/characters" && branch.label === "Characters"), true);
    assert.equal(compiled.context.allLeaves.find((leaf) => leaf.id === "CHAR-ONE")?.branchId, "reference/characters");
    assert.equal(compiled.context.allBranches.find((branch) => branch.id === "reference/characters")?.leaves.length, 1);
    assert.equal(compiled.context.content.branches.find((branch) => branch.id === "reference")?.branches[0]?.id, "reference/characters");

    assert.match(rendered.source.markdown, /Body\./);
    assert.doesNotMatch(rendered.source.markdown, /CMT-0001/);
    assert.match(rendered.source.markdown, /#CH-ONE/);
    assert.match(rendered.source.markdown, /CH-ONE--opening/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("renderDocument emits presentation markers, page regions, and image attrs", () => {
  const document = engine.Stego.Document({
    page: { size: "letter", margin: "1in" },
    bodyStyle: {
      fontFamily: "Times New Roman",
      fontSize: "12pt",
      lineSpacing: 2,
      spaceBefore: 0,
      spaceAfter: 0,
    },
    headingStyle: {
      color: "#333333",
      fontWeight: "normal"
    },
    children: [
      engine.Stego.PageTemplate({
        header: {
          left: "Funny Business",
          center: engine.Stego.Span({ italic: true, color: "#666666", children: "Draft" }),
        },
        footer: {
          right: [
            "Page ",
            engine.Stego.PageNumber(),
          ],
        },
      }),
      engine.Stego.PageBreak(),
      engine.Stego.KeepTogether({
        children: [
          engine.Stego.Heading({ level: 2, children: "Kept heading" }),
          engine.Stego.Paragraph({ children: "Kept paragraph" })
        ]
      }),
      engine.Stego.Section({
        bodyStyle: {
          insetLeft: "24pt",
          insetRight: "24pt",
          spaceBefore: 18,
          spaceAfter: 12,
          firstLineIndent: "1.5em",
          lineSpacing: 1.5,
        },
        headingStyles: {
          2: {
            spaceBefore: 24,
            spaceAfter: 18,
            fontFamily: "Georgia",
            underline: true,
          }
        },
        children: [
          engine.Stego.Heading({ level: 2, children: "Inset heading" }),
          engine.Stego.Paragraph({ children: "Section body paragraph" }),
          engine.Stego.Paragraph({
            align: "center",
            firstLineIndent: "2em",
            fontSize: "11pt",
            children: [
              "Inset ",
              engine.Stego.Span({ fontWeight: "bold", underline: true, children: "paragraph" }),
            ],
          })
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
      content: { kind: "content", name: "content", label: "Content", relativeDir: "content", metadata: {}, leaves: [], branches: [] },
      allLeaves: [],
      allBranches: []
    }
  });
  assert.equal(rendered.backend, "pandoc-presentation");
  assert.equal(rendered.source.inputFormat, "markdown+bracketed_spans-implicit_figures");
  assert.deepEqual(rendered.source.requiredFilters, ["image-layout", "block-layout"]);
  assert.deepEqual(rendered.presentation.page.geometry, ["paper=letterpaper", "margin=1in"]);
  assert.equal(rendered.presentation.page.fontFamily, "Times New Roman");
  assert.equal(rendered.presentation.page.fontSize, "12pt");
  assert.equal(rendered.presentation.page.lineSpacing, 2);
  assert.equal(rendered.presentation.page.spaceBefore, "0pt");
  assert.equal(rendered.presentation.page.spaceAfter, "0pt");
  assert.deepEqual(rendered.presentation.page.header?.left, [{ kind: "text", value: "Funny Business" }]);
  assert.equal(rendered.presentation.page.header?.center?.[0]?.kind, "span");
  assert.equal(rendered.presentation.page.header?.center?.[0]?.italic, true);
  assert.equal(rendered.presentation.page.header?.center?.[0]?.color, "#666666");
  assert.deepEqual(rendered.presentation.page.header?.center?.[0]?.children, [{ kind: "text", value: "Draft" }]);
  assert.deepEqual(rendered.presentation.page.footer?.right, [
    { kind: "text", value: "Page " },
    { kind: "pageNumber" },
  ]);
  assert.match(rendered.source.markdown, /data-page-break=true/);
  assert.match(rendered.source.markdown, /data-keep-together=true/);
  assert.match(rendered.source.markdown, /data-space-before=18pt/);
  assert.match(rendered.source.markdown, /data-space-after=12pt/);
  assert.match(rendered.source.markdown, /data-inset-left=24pt/);
  assert.match(rendered.source.markdown, /data-inset-right=24pt/);
  assert.match(rendered.source.markdown, /data-first-line-indent=1.5em/);
  assert.match(rendered.source.markdown, /data-first-line-indent=2em/);
  assert.match(rendered.source.markdown, /data-line-spacing=1.5/);
  assert.match(rendered.source.markdown, /data-font-family="Georgia"/);
  assert.match(rendered.source.markdown, /data-font-size=11pt/);
  assert.match(rendered.source.markdown, /data-font-weight=normal/);
  assert.match(rendered.source.markdown, /data-underline=true/);
  assert.match(rendered.source.markdown, /data-color="#333333"/);
  assert.match(rendered.source.markdown, /\{custom-style="StegoSpan1" data-font-weight=bold data-underline=true\}/);
  assert.match(rendered.source.markdown, /data-layout=block/);
  assert.equal(Array.isArray(rendered.presentation.blockMarkers), true);
  assert.equal(rendered.presentation.blockMarkers.length >= 4, true);
  assert.equal(rendered.presentation.inlineStyles.length, 1);
  assert.deepEqual(rendered.presentation.inlineStyles[0], {
    styleId: "StegoSpan1",
    fontWeight: "bold",
    italic: undefined,
    underline: true,
    smallCaps: undefined,
    color: undefined,
    fontFamily: undefined,
    fontSizePt: undefined,
  });
  assert.equal(rendered.presentation.blockMarkers.some((entry) => entry.keepTogether === true), true);
  assert.equal(
    rendered.presentation.blockMarkers.some((entry) => entry.spaceBefore === "18pt" && entry.firstLineIndent === "1.5em" && entry.lineSpacing === 1.5),
    true
  );
  assert.equal(
    rendered.presentation.blockMarkers.some((entry) => entry.spaceBefore === "24pt" && entry.spaceAfter === "18pt" && entry.fontFamily === "Georgia" && entry.underline === true),
    true
  );
  assert.equal(
    rendered.presentation.blockMarkers.some((entry) =>
      entry.align === "center"
      && entry.fontSizePt === 11
      && entry.spaceBefore === "18pt"
      && entry.insetLeft === "24pt"
      && entry.firstLineIndent === "2em"
    ),
    true
  );
  assert.equal(rendered.presentation.blockMarkers.some((entry) => entry.pageBreak === true), true);
  assert.equal(rendered.presentation.features.requiresNamedFontEngine, true);
  assert.equal(rendered.presentation.features.usesUnderline, true);
  assert.equal(rendered.presentation.features.usesTextColor, true);
  assert.equal("metadata" in rendered, false);
  assert.equal("postprocess" in rendered, false);
});

test("renderDocument turns markdown into block IR and applies section paragraph defaults", () => {
  const document = engine.Stego.Document({
    children: [
      engine.Stego.Section({
        bodyStyle: {
          spaceAfter: "12pt"
        },
        children: [
          engine.Stego.Markdown({
            source: `# Heading

First paragraph with *markdown*.

- item one
- item two

Second paragraph.`
          })
        ]
      })
    ]
  });

  const rendered = engine.renderDocument({
    document,
    projectRoot: "/tmp/demo",
    context: {
      project: { id: "demo", root: "/tmp/demo", metadata: {} },
      content: { kind: "content", name: "content", label: "Content", relativeDir: "content", metadata: {}, leaves: [], branches: [] },
      allLeaves: [],
      allBranches: []
    }
  });

  assert.match(rendered.source.markdown, /# Heading/);
  assert.match(rendered.source.markdown, /data-space-after=12pt/);
  assert.match(rendered.source.markdown, /First paragraph with \*markdown\*\./);
  assert.match(rendered.source.markdown, /- item one/);
  assert.match(rendered.source.markdown, /Second paragraph\./);
  assert.equal(
    rendered.presentation.blockMarkers.some((entry) => entry.spaceAfter === "12pt"),
    true
  );
});

test("renderDocument resolves grouped heading and body styles for markdown and explicit blocks", () => {
  const document = engine.Stego.Document({
    bodyStyle: {
      fontFamily: "Times New Roman",
      fontSize: "12pt",
      lineSpacing: 2,
      spaceAfter: "6pt",
    },
    headingStyle: {
      fontWeight: "bold",
      color: "#222222",
    },
    headingStyles: {
      1: { spaceAfter: "18pt" }
    },
    children: [
      engine.Stego.Section({
        bodyStyle: {
          spaceAfter: "12pt",
          firstLineIndent: "0.5in",
        },
        headingStyles: {
          1: {
            fontWeight: "normal",
            underline: true,
          }
        },
        children: [
          engine.Stego.Heading({ level: 1, children: "Explicit heading" }),
          engine.Stego.Markdown({ source: "# Markdown heading\n\nBody paragraph." }),
        ]
      })
    ]
  });

  const rendered = engine.renderDocument({
    document,
    projectRoot: "/tmp/demo",
    context: {
      project: { id: "demo", root: "/tmp/demo", metadata: {} },
      content: { kind: "content", name: "content", label: "Content", relativeDir: "content", metadata: {}, leaves: [], branches: [] },
      allLeaves: [],
      allBranches: []
    }
  });

  assert.match(rendered.source.markdown, /data-font-weight=normal/);
  assert.match(rendered.source.markdown, /data-underline=true/);
  assert.match(rendered.source.markdown, /data-color="#222222"/);
  assert.match(rendered.source.markdown, /data-first-line-indent=0.5in/);
  assert.match(rendered.source.markdown, /data-space-after=12pt/);
});

test("renderDocument parses stego-spacer blocks in markdown and emits spacer markers", () => {
  const document = engine.Stego.Document({
    bodyStyle: {
      fontSize: "12pt",
      lineSpacing: 2,
    },
    children: [
      engine.Stego.Markdown({
        source: `Sincerely,

<stego-spacer lines="3" />

Matt Gold`
      })
    ]
  });

  const rendered = engine.renderDocument({
    document,
    projectRoot: "/tmp/demo",
    context: {
      project: { id: "demo", root: "/tmp/demo", metadata: {} },
      content: { kind: "content", name: "content", label: "Content", relativeDir: "content", metadata: {}, leaves: [], branches: [] },
      allLeaves: [],
      allBranches: []
    }
  });

  assert.match(rendered.source.markdown, /data-spacer-lines=3/);
  assert.match(rendered.source.markdown, /data-font-size=12pt/);
  assert.match(rendered.source.markdown, /data-line-spacing=2/);
  assert.equal(
    rendered.presentation.blockMarkers.some((entry) =>
      entry.spacerLines === 3
      && entry.fontSizePt === 12
      && entry.lineSpacing === 2
    ),
    true
  );
});

test("renderDocument renders Stego.Spacer in templates using inherited body defaults", () => {
  const document = engine.Stego.Document({
    bodyStyle: {
      fontSize: "12pt",
      lineSpacing: 2,
    },
    children: [
      engine.Stego.Paragraph({ children: "Sincerely," }),
      engine.Stego.Spacer({ lines: 2 }),
      engine.Stego.Paragraph({ children: "Matt Gold" }),
    ]
  });

  const rendered = engine.renderDocument({
    document,
    projectRoot: "/tmp/demo",
    context: {
      project: { id: "demo", root: "/tmp/demo", metadata: {} },
      content: { kind: "content", name: "content", label: "Content", relativeDir: "content", metadata: {}, leaves: [], branches: [] },
      allLeaves: [],
      allBranches: []
    }
  });

  assert.match(rendered.source.markdown, /data-spacer-lines=2/);
  assert.match(rendered.source.markdown, /data-font-size=12pt/);
  assert.match(rendered.source.markdown, /data-line-spacing=2/);
  assert.equal(
    rendered.presentation.blockMarkers.some((entry) =>
      entry.spacerLines === 2
      && entry.fontSizePt === 12
      && entry.lineSpacing === 2
    ),
    true
  );
});

test("renderDocument parses stego-span inline directives in markdown content", () => {
  const document = engine.Stego.Document({
    children: [
      engine.Stego.Markdown({
        source: `# <stego-span italic color="#666666">Title</stego-span>

Very <stego-span font-weight="bold" underline>important</stego-span> text.

- <stego-span small-caps>List item</stego-span>`
      })
    ]
  });

  const rendered = engine.renderDocument({
    document,
    projectRoot: "/tmp/demo",
    context: {
      project: { id: "demo", root: "/tmp/demo", metadata: {} },
      content: { kind: "content", name: "content", label: "Content", relativeDir: "content", metadata: {}, leaves: [], branches: [] },
      allLeaves: [],
      allBranches: []
    }
  });

  assert.match(rendered.source.markdown, /\[Title\]\{custom-style="StegoSpan1" data-italic=true data-color="#666666"\}/);
  assert.match(rendered.source.markdown, /\[important\]\{custom-style="StegoSpan2" data-font-weight=bold data-underline=true\}/);
  assert.match(rendered.source.markdown, /- \[List item\]\{custom-style="StegoSpan3" data-small-caps=true\}/);
  assert.deepEqual(rendered.presentation.inlineStyles, [
    {
      styleId: "StegoSpan1",
      fontFamily: undefined,
      fontSizePt: undefined,
      fontWeight: undefined,
      italic: true,
      underline: undefined,
      smallCaps: undefined,
      color: "#666666",
    },
    {
      styleId: "StegoSpan2",
      fontFamily: undefined,
      fontSizePt: undefined,
      fontWeight: "bold",
      italic: undefined,
      underline: true,
      smallCaps: undefined,
      color: undefined,
    },
    {
      styleId: "StegoSpan3",
      fontFamily: undefined,
      fontSizePt: undefined,
      fontWeight: undefined,
      italic: undefined,
      underline: undefined,
      smallCaps: true,
      color: undefined,
    }
  ]);
});

test("renderDocument rejects invalid stego markdown directives", () => {
  const createContext = () => ({
    project: { id: "demo", root: "/tmp/demo", metadata: {} },
    content: { kind: "content", name: "content", label: "Content", relativeDir: "content", metadata: {}, leaves: [], branches: [] },
    allLeaves: [],
    allBranches: []
  });

  assert.throws(() => engine.renderDocument({
    document: engine.Stego.Document({
      children: [engine.Stego.Markdown({ source: "<stego-spacer></stego-spacer>" })]
    }),
    projectRoot: "/tmp/demo",
    context: createContext()
  }), /self-closing syntax/i);

  assert.throws(() => engine.renderDocument({
    document: engine.Stego.Document({
      children: [engine.Stego.Markdown({ source: "<stego-spacer lines={3} />" })]
    }),
    projectRoot: "/tmp/demo",
    context: createContext()
  }), /quoted HTML-style values/i);

  assert.throws(() => engine.renderDocument({
    document: engine.Stego.Document({
      children: [engine.Stego.Markdown({ source: "<stego-foo />" })]
    }),
    projectRoot: "/tmp/demo",
    context: createContext()
  }), /Supported directives: stego-spacer/i);

  assert.throws(() => engine.renderDocument({
    document: engine.Stego.Document({
      children: [engine.Stego.Markdown({ source: "Hello <stego-span font-weight=\"heavy\">world</stego-span>" })]
    }),
    projectRoot: "/tmp/demo",
    context: createContext()
  }), /font-weight value 'heavy'/i);

  assert.throws(() => engine.renderDocument({
    document: engine.Stego.Document({
      children: [engine.Stego.Markdown({ source: "Hello <stego-span italic={true}>world</stego-span>" })]
    }),
    projectRoot: "/tmp/demo",
    context: createContext()
  }), /quoted HTML-style values/i);

  assert.throws(() => engine.renderDocument({
    document: engine.Stego.Document({
      children: [engine.Stego.Markdown({ source: "Hello <stego-span font-weight>world</stego-span>" })]
    }),
    projectRoot: "/tmp/demo",
    context: createContext(),
  }), /font-weight value ''/i);

  assert.throws(() => engine.renderDocument({
    document: engine.Stego.Document({
      children: [engine.Stego.Markdown({ source: "Hello <stego-span>world" })]
    }),
    projectRoot: "/tmp/demo",
    context: createContext()
  }), /must be closed/i);
});

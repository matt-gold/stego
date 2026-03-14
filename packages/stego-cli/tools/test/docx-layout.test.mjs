import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..", "..");
const { applyDocxLayoutToDocumentXml } = await import(
  pathToFileURL(path.join(packageRoot, "src", "modules", "export", "infra", "docx-layout.ts")).href
);

test("docx layout postprocessor applies keepTogether within marked bookmark ranges", () => {
  const source = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:bookmarkStart w:id="10" w:name="stego-layout-1"/>
    <w:p><w:pPr><w:pStyle w:val="Heading2" /></w:pPr><w:r><w:t>Heading</w:t></w:r></w:p>
    <w:p><w:r><w:t>Paragraph</w:t></w:r></w:p>
    <w:bookmarkEnd w:id="10"/>
    <w:p><w:r><w:t>Outside</w:t></w:r></w:p>
  </w:body>
</w:document>`;

  const rewritten = applyDocxLayoutToDocumentXml(source, [{ bookmarkName: "stego-layout-1", keepTogether: true }]);

  assert.match(rewritten, /<w:keepNext\/>/);
  assert.match(rewritten, /<w:keepLines\/>/);
  assert.match(
    rewritten,
    /<w:p><w:pPr><w:pStyle w:val="Heading2"\s*\/><w:keepLines\/><w:keepNext\/><\/w:pPr>/
  );
  assert.match(
    rewritten,
    /<w:p><w:pPr><w:keepLines\/><\/w:pPr><w:r><w:t>Paragraph<\/w:t><\/w:r><\/w:p>/
  );
  assert.doesNotMatch(
    rewritten,
    /<w:p><w:pPr><w:keepLines\/><w:keepNext\/><\/w:pPr><w:r><w:t>Outside<\/w:t><\/w:r><\/w:p>/
  );
});

test("docx layout postprocessor applies paragraph spacing, inset, first-line indent, and alignment", () => {
  const source = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:bookmarkStart w:id="10" w:name="stego-layout-1"/>
    <w:p><w:pPr><w:pStyle w:val="Heading2" /></w:pPr><w:r><w:t>Heading</w:t></w:r></w:p>
    <w:p><w:r><w:t>Paragraph</w:t></w:r></w:p>
    <w:bookmarkEnd w:id="10"/>
  </w:body>
</w:document>`;

  const rewritten = applyDocxLayoutToDocumentXml(source, [{
    bookmarkName: "stego-layout-1",
    spaceBefore: "12pt",
    spaceAfter: "18pt",
    insetLeft: "24pt",
    insetRight: "30pt",
    firstLineIndent: "1.5em",
    align: "center"
  }]);

  assert.match(rewritten, /<w:spacing w:before="240" w:after="360"\/>/);
  assert.match(rewritten, /<w:ind w:left="480" w:right="600" w:firstLine="360"\/>/);
  assert.match(rewritten, /<w:jc w:val="center"\/>/);
});

test("docx layout postprocessor inserts standalone page-break paragraphs for empty markers", () => {
  const source = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Before</w:t></w:r></w:p>
    <w:bookmarkStart w:id="10" w:name="stego-layout-1"/>
    <w:bookmarkEnd w:id="10"/>
    <w:p><w:r><w:t>After</w:t></w:r></w:p>
  </w:body>
</w:document>`;

  const rewritten = applyDocxLayoutToDocumentXml(source, [{ bookmarkName: "stego-layout-1", pageBreak: true }]);

  assert.match(rewritten, /<w:bookmarkStart w:id="10" w:name="stego-layout-1"\/>\s*<w:p><w:r><w:br w:type="page"\/><\/w:r><\/w:p>\s*<w:bookmarkEnd w:id="10"\/>/);
});

test("docx layout postprocessor applies pageBreakBefore to the first paragraph in a marked range", () => {
  const source = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:bookmarkStart w:id="10" w:name="stego-layout-1"/>
    <w:p><w:r><w:t>First</w:t></w:r></w:p>
    <w:p><w:r><w:t>Second</w:t></w:r></w:p>
    <w:bookmarkEnd w:id="10"/>
  </w:body>
</w:document>`;

  const rewritten = applyDocxLayoutToDocumentXml(source, [{ bookmarkName: "stego-layout-1", pageBreak: true }]);

  assert.match(rewritten, /<w:p><w:pPr><w:pageBreakBefore\/><\/w:pPr><w:r><w:t>First<\/w:t><\/w:r><\/w:p>/);
});

test("nested docx layout markers apply outer defaults first and inner overrides second", () => {
  const source = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:bookmarkStart w:id="10" w:name="outer"/>
    <w:p><w:r><w:t>Outer only</w:t></w:r></w:p>
    <w:bookmarkStart w:id="11" w:name="inner"/>
    <w:p><w:r><w:t>Inner paragraph</w:t></w:r></w:p>
    <w:bookmarkEnd w:id="11"/>
    <w:bookmarkEnd w:id="10"/>
  </w:body>
</w:document>`;

  const rewritten = applyDocxLayoutToDocumentXml(source, [
    { bookmarkName: "outer", align: "center", insetLeft: "24pt" },
    { bookmarkName: "inner", align: "right" }
  ]);

  assert.match(
    rewritten,
    /<w:p><w:pPr><w:ind w:left="480"\/><w:jc w:val="center"\/><\/w:pPr><w:r><w:t>Outer only<\/w:t><\/w:r><\/w:p>/
  );
  assert.match(
    rewritten,
    /<w:p><w:pPr><w:ind w:left="480"\/><w:jc w:val="right"\/><\/w:pPr><w:r><w:t>Inner paragraph<\/w:t><\/w:r><\/w:p>/
  );
});

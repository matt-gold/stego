import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..", "..");
const { applyDocxLayoutToDocumentXml, applyDocxDocumentStyleToStylesXml } = await import(
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

test("docx layout postprocessor applies paragraph spacing, inset, first-line indent, alignment, and typography", () => {
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
    align: "center",
    fontFamily: "Times New Roman",
    fontSizePt: 12,
    lineSpacing: 2
  }]);

  assert.match(rewritten, /<w:spacing w:before="240" w:after="360" w:line="480" w:lineRule="auto"\/>/);
  assert.match(rewritten, /<w:ind w:left="480" w:right="600" w:firstLine="360"\/>/);
  assert.match(rewritten, /<w:jc w:val="center"\/>/);
  assert.match(rewritten, /<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"\/>/);
  assert.match(rewritten, /<w:sz w:val="24"\/>/);
  assert.match(rewritten, /<w:szCs w:val="24"\/>/);
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

test("docx styles postprocessor patches Normal style with typography defaults", () => {
  const source = `<?xml version="1.0" encoding="UTF-8"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Normal" w:default="1">
    <w:name w:val="Normal"/>
  </w:style>
</w:styles>`;

  const rewritten = applyDocxDocumentStyleToStylesXml(source, {
    fontFamily: "Times New Roman",
    fontSizePt: 12,
    lineSpacing: 2,
    parSpaceBefore: "0pt",
    parSpaceAfter: "0pt"
  });

  assert.match(rewritten, /<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"\/>/);
  assert.match(rewritten, /<w:sz w:val="24"\/>/);
  assert.match(rewritten, /<w:szCs w:val="24"\/>/);
  assert.match(rewritten, /<w:spacing w:line="480" w:lineRule="auto" w:before="0" w:after="0"|<w:spacing w:before="0" w:after="0" w:line="480" w:lineRule="auto"|<w:spacing w:before="0" w:line="480" w:lineRule="auto" w:after="0"|<w:spacing w:line="480" w:before="0" w:lineRule="auto" w:after="0"/);
});

test("docx styles postprocessor applies paragraph spacing defaults to Normal style", () => {
  const source = `<?xml version="1.0" encoding="UTF-8"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Normal" w:default="1">
    <w:name w:val="Normal"/>
  </w:style>
</w:styles>`;

  const rewritten = applyDocxDocumentStyleToStylesXml(source, {
    parSpaceBefore: "6pt",
    parSpaceAfter: "12pt"
  });

  assert.match(rewritten, /w:before="120"/);
  assert.match(rewritten, /w:after="240"/);
});

test("docx styles postprocessor overrides Pandoc body paragraph styles that would reintroduce spacing", () => {
  const source = `<?xml version="1.0" encoding="UTF-8"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Normal" w:default="1">
    <w:name w:val="Normal"/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="BodyText">
    <w:name w:val="Body Text"/>
    <w:pPr><w:spacing w:before="180" w:after="180"/></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="FirstParagraph">
    <w:name w:val="First Paragraph"/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Compact">
    <w:name w:val="Compact"/>
    <w:pPr><w:spacing w:before="36" w:after="36"/></w:pPr>
  </w:style>
</w:styles>`;

  const rewritten = applyDocxDocumentStyleToStylesXml(source, {
    parSpaceBefore: "0pt",
    parSpaceAfter: "0pt"
  });

  assert.match(rewritten, /<w:style w:type="paragraph" w:styleId="BodyText">[\s\S]*<w:spacing[^>]*w:before="0"[^>]*w:after="0"\/>/);
  assert.match(rewritten, /<w:style w:type="paragraph" w:styleId="FirstParagraph">[\s\S]*<w:spacing[^>]*w:before="0"[^>]*w:after="0"\/>/);
  assert.match(rewritten, /<w:style w:type="paragraph" w:styleId="Compact">[\s\S]*<w:spacing[^>]*w:before="0"[^>]*w:after="0"\/>/);
});

test("docx styles postprocessor neutralizes Pandoc heading colors and applies the document font family", () => {
  const source = `<?xml version="1.0" encoding="UTF-8"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:rPr>
      <w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi" w:cstheme="majorBidi"/>
      <w:color w:themeColor="accent1" w:val="0F4761"/>
      <w:sz w:val="40"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:rPr>
      <w:color w:themeColor="accent1" w:val="0F4761"/>
    </w:rPr>
  </w:style>
  <w:style w:type="character" w:styleId="Heading1Char">
    <w:name w:val="Heading 1 Char"/>
    <w:rPr>
      <w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi" w:cstheme="majorBidi"/>
      <w:color w:themeColor="accent1" w:val="0F4761"/>
      <w:sz w:val="40"/>
    </w:rPr>
  </w:style>
  <w:style w:type="character" w:styleId="Heading2Char">
    <w:name w:val="Heading 2 Char"/>
    <w:rPr>
      <w:color w:themeColor="accent1" w:val="0F4761"/>
    </w:rPr>
  </w:style>
</w:styles>`;

  const rewritten = applyDocxDocumentStyleToStylesXml(source, {
    fontFamily: "Times New Roman"
  });

  assert.match(rewritten, /<w:style w:type="paragraph" w:styleId="Heading1">[\s\S]*<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"\/>/);
  assert.match(rewritten, /<w:style w:type="paragraph" w:styleId="Heading2">[\s\S]*<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"\/>/);
  assert.match(rewritten, /<w:style w:type="character" w:styleId="Heading1Char">[\s\S]*<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"\/>/);
  assert.match(rewritten, /<w:style w:type="character" w:styleId="Heading2Char">[\s\S]*<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"\/>/);
  assert.doesNotMatch(rewritten, /<w:color /);
});

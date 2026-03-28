import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import JSZip from "jszip";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..", "..");
const { applyDocxLayout, applyDocxLayoutToDocumentXml, applyDocxDocumentStyleToStylesXml } = await import(
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

test("docx layout postprocessor applies pageBreakBefore to the first following paragraph for empty markers", () => {
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

  assert.doesNotMatch(rewritten, /<w:br w:type="page"\/>/);
  assert.match(
    rewritten,
    /<w:bookmarkStart w:id="10" w:name="stego-layout-1"\/>\s*<w:bookmarkEnd w:id="10"\/>\s*<w:p><w:pPr><w:pageBreakBefore\/><\/w:pPr><w:r><w:t>After<\/w:t><\/w:r><\/w:p>/
  );
});

test("docx layout postprocessor treats trailing empty page-break markers as no-op", () => {
  const source = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Before</w:t></w:r></w:p>
    <w:bookmarkStart w:id="10" w:name="stego-layout-1"/>
    <w:bookmarkEnd w:id="10"/>
  </w:body>
</w:document>`;

  const rewritten = applyDocxLayoutToDocumentXml(source, [{ bookmarkName: "stego-layout-1", pageBreak: true }]);

  assert.equal(rewritten, source);
});

test("docx layout postprocessor inserts standalone spacer paragraphs for empty markers", () => {
  const source = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Before</w:t></w:r></w:p>
    <w:bookmarkStart w:id="10" w:name="stego-layout-1"/>
    <w:bookmarkEnd w:id="10"/>
    <w:p><w:r><w:t>After</w:t></w:r></w:p>
  </w:body>
</w:document>`;

  const rewritten = applyDocxLayoutToDocumentXml(source, [{
    bookmarkName: "stego-layout-1",
    spacerLines: 3,
    fontSizePt: 12,
    lineSpacing: 2
  }]);

  assert.match(
    rewritten,
    /<w:bookmarkStart w:id="10" w:name="stego-layout-1"\/>\s*<w:p><w:pPr><w:spacing w:line="480" w:lineRule="auto" w:after="960"\/><\/w:pPr><w:r\/><\/w:p>\s*<w:bookmarkEnd w:id="10"\/>/
  );
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
    spaceBefore: "0pt",
    spaceAfter: "0pt"
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
    spaceBefore: "6pt",
    spaceAfter: "12pt"
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
    spaceBefore: "0pt",
    spaceAfter: "0pt"
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

test("docx layout postprocessor applies heading run emphasis and color overrides", () => {
  const source = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:bookmarkStart w:id="10" w:name="stego-layout-1"/>
    <w:p><w:pPr><w:pStyle w:val="Heading1" /></w:pPr><w:r><w:t>Heading</w:t></w:r></w:p>
    <w:bookmarkEnd w:id="10"/>
  </w:body>
</w:document>`;

  const rewritten = applyDocxLayoutToDocumentXml(source, [{
    bookmarkName: "stego-layout-1",
    fontWeight: "normal",
    italic: true,
    underline: true,
    smallCaps: true,
    color: "333333"
  }]);

  assert.match(rewritten, /<w:b w:val="0"\/>/);
  assert.match(rewritten, /<w:bCs w:val="0"\/>/);
  assert.match(rewritten, /<w:i w:val="1"\/>/);
  assert.match(rewritten, /<w:iCs w:val="1"\/>/);
  assert.match(rewritten, /<w:u w:val="single"\/>/);
  assert.match(rewritten, /<w:smallCaps w:val="1"\/>/);
  assert.match(rewritten, /<w:color w:val="333333"\/>/);
});

test("docx layout postprocessor creates header and footer parts with page regions and character styles", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stego-docx-layout-"));
  const docxPath = path.join(tempDir, "template.docx");
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>');
  zip.file(
    "word/document.xml",
    '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Body</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>',
  );
  zip.file("word/styles.xml", '<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:styles>');
  fs.writeFileSync(docxPath, await zip.generateAsync({ type: "nodebuffer" }));

  try {
    await applyDocxLayout(docxPath, {
      characterStyles: [{
        styleId: "StegoSpan1",
        italic: true,
        color: "#666666",
      }],
      pageTemplate: {
        header: {
          left: [{ kind: "text", value: "Funny Business" }],
          right: [{ kind: "text", value: "Page " }, { kind: "pageNumber" }],
        },
        footer: {
          center: [{
            kind: "span",
            italic: true,
            color: "#666666",
            children: [{ kind: "text", value: "Draft" }],
          }],
        },
        defaultFontFamily: "Times New Roman",
        defaultFontSizePt: 12,
        defaultLineSpacing: 2,
      },
    });

    const archive = await JSZip.loadAsync(fs.readFileSync(docxPath));
    const contentTypes = await archive.file("[Content_Types].xml").async("string");
    const rels = await archive.file("word/_rels/document.xml.rels").async("string");
    const documentXml = await archive.file("word/document.xml").async("string");
    const headerXml = await archive.file("word/header1.xml").async("string");
    const footerXml = await archive.file("word/footer1.xml").async("string");
    const stylesXml = await archive.file("word/styles.xml").async("string");

    assert.match(contentTypes, /PartName="\/word\/header1.xml"/);
    assert.match(contentTypes, /PartName="\/word\/footer1.xml"/);
    assert.match(rels, /Type="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/header" Target="header1.xml"/);
    assert.match(rels, /Type="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/footer" Target="footer1.xml"/);
    assert.match(documentXml, /<w:headerReference w:type="default" r:id="rId\d+"\/>/);
    assert.match(documentXml, /<w:footerReference w:type="default" r:id="rId\d+"\/>/);
    assert.doesNotMatch(headerXml, /<w:tbl>/);
    assert.match(headerXml, /<w:tabs><w:tab w:val="right" w:pos="9360"\/><\/w:tabs>/);
    assert.match(headerXml, /Funny Business/);
    assert.match(headerXml, /<w:tab\/>/);
    assert.match(headerXml, /<w:instrText xml:space="preserve"> PAGE <\/w:instrText>/);
    assert.match(headerXml, /<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"\/>/);
    assert.match(footerXml, /Draft/);
    assert.match(footerXml, /<w:jc w:val="center"\/>/);
    assert.doesNotMatch(footerXml, /<w:tabs>/);
    assert.match(footerXml, /<w:i w:val="1"\/>/);
    assert.match(footerXml, /<w:color w:val="#666666"\/>|<w:color w:val="666666"\/>/);
    assert.match(stylesXml, /<w:style w:type="character" w:styleId="StegoSpan1" w:customStyle="1">/);
    assert.match(stylesXml, /<w:i w:val="1"\/>/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("docx page regions use full-width paragraph alignment when only one slot is populated", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stego-docx-layout-"));
  const docxPath = path.join(tempDir, "template.docx");
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>');
  zip.file(
    "word/document.xml",
    '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Body</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>',
  );
  zip.file("word/styles.xml", '<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:styles>');
  fs.writeFileSync(docxPath, await zip.generateAsync({ type: "nodebuffer" }));

  try {
    await applyDocxLayout(docxPath, {
      pageTemplate: {
        header: {
          center: [{ kind: "text", value: "Centered" }],
        },
      },
    });

    const archive = await JSZip.loadAsync(fs.readFileSync(docxPath));
    const headerXml = await archive.file("word/header1.xml").async("string");

    assert.match(headerXml, /<w:jc w:val="center"\/>/);
    assert.doesNotMatch(headerXml, /<w:tabs>/);
    assert.match(headerXml, /Centered/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..", "..");
const { applyKeepTogetherToDocumentXml } = await import(
  pathToFileURL(path.join(packageRoot, "src", "modules", "export", "infra", "docx-keep-together.ts")).href
);

test("docx keep-together postprocessor applies keepNext and keepLines within marked bookmark ranges", () => {
  const source = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:bookmarkStart w:id="10" w:name="stego-keep-together-1"/>
    <w:p><w:pPr><w:pStyle w:val="Heading2" /></w:pPr><w:r><w:t>Heading</w:t></w:r></w:p>
    <w:p><w:r><w:t>Paragraph</w:t></w:r></w:p>
    <w:bookmarkEnd w:id="10"/>
    <w:p><w:r><w:t>Outside</w:t></w:r></w:p>
  </w:body>
</w:document>`;

  const rewritten = applyKeepTogetherToDocumentXml(source);

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

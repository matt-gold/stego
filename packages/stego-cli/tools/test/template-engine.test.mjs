import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const cliPath = path.join(repoRoot, "tools", "stego-cli.ts");

function runCli(args, options = {}) {
  return spawnSync("node", ["--experimental-strip-types", cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      ...(options.env || {})
    }
  });
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function writePng(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn8n4sAAAAASUVORK5CYII=",
      "base64"
    )
  );
}

function createTempProject(projectId) {
  const projectRoot = path.join(repoRoot, "projects", projectId);
  fs.mkdirSync(path.join(projectRoot, "content", "reference"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "assets", "maps"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "templates"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "dist"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "notes"), { recursive: true });

  writeFile(path.join(projectRoot, "stego-project.json"), `${JSON.stringify({
    id: projectId,
    title: "Template Test",
    subtitle: "Demo subtitle"
  }, null, 2)}\n`);

  writeFile(path.join(projectRoot, "content", "100-scene.md"), `---
id: CH-OPENING
status: revise
chapter: 1
chapter_title: Opening
---

Hello template world.
`);
  writeFile(path.join(projectRoot, "content", "reference", "SRC-ONE.md"), "---\nid: SRC-ONE\nkind: reference\nlabel: Source One\n---\n\n# Source One\n\nA note.\n");
  writePng(path.join(projectRoot, "assets", "maps", "city-plan.png"));
  writeFile(path.join(projectRoot, "templates", "book.template.tsx"), `import { defineTemplate, Stego } from "@stego-labs/engine";
export default defineTemplate((ctx) => (
  <Stego.Document page={{ size: "6x9", margin: "0.75in" }}>
    <Stego.PageTemplate footer={{ right: <Stego.PageNumber /> }}>
      <Stego.Heading level={1}>{String(ctx.project.metadata.title ?? ctx.project.id)}</Stego.Heading>
      <Stego.Image src="assets/maps/city-plan.png" alt="Map" width="60%" layout="block" align="center" />
      {Stego.groupBy(ctx.allLeaves, (leaf) => asString(leaf.metadata.chapter)).map((group) => (
        <Stego.Section role="chapter">
          <Stego.Heading level={2}>Chapter {group.value}</Stego.Heading>
          {group.items.map((leaf) => <Stego.Markdown leaf={leaf} />)}
        </Stego.Section>
      ))}
      <Stego.Paragraph><Stego.Link leaf="SRC-ONE" /></Stego.Paragraph>
    </Stego.PageTemplate>
  </Stego.Document>
));

function asString(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return undefined;
}
`);

  return projectRoot;
}

test("template build writes markdown and backend-document artifacts", () => {
  const projectId = `template-build-${Date.now()}-${process.pid}`;
  const projectRoot = createTempProject(projectId);

  try {
    const result = runCli(["template", "build", "--project", projectId]);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

    const markdownPath = path.join(projectRoot, "dist", `${projectId}.template.md`);
    const backendDocumentPath = path.join(projectRoot, "dist", `${projectId}.template.backend-document.json`);
    assert.equal(fs.existsSync(markdownPath), true);
    assert.equal(fs.existsSync(backendDocumentPath), true);

    const markdown = fs.readFileSync(markdownPath, "utf8");
    assert.match(markdown, /Chapter 1/);
    assert.match(markdown, /Hello template world\./);
    assert.match(markdown, /\[Source One\]\(#SRC-ONE\)/);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("template build applies branch leafPolicy defaults to loaded leaf metadata", () => {
  const projectId = `template-branch-defaults-${Date.now()}-${process.pid}`;
  const projectRoot = createTempProject(projectId);

  writeFile(path.join(projectRoot, "content", "reference", "_branch.md"), `---
label: Reference
leafPolicy:
  defaults:
    kind: reference
---
`);
  writeFile(path.join(projectRoot, "content", "reference", "SRC-ONE.md"), "---\nid: SRC-ONE\nlabel: Source One\n---\n\n# Source One\n\nA note.\n");
  writeFile(path.join(projectRoot, "templates", "book.template.tsx"), `import { defineTemplate, Stego } from "@stego-labs/engine";
export default defineTemplate((ctx) => (
  <Stego.Document>
    {ctx.allLeaves.map((leaf) => (
      <Stego.Paragraph>{asString(leaf.metadata.kind) ?? "missing"}</Stego.Paragraph>
    ))}
  </Stego.Document>
));

function asString(value) {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return undefined;
}
`);

  try {
    const result = runCli(["template", "build", "--project", projectId]);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

    const markdownPath = path.join(projectRoot, "dist", `${projectId}.template.md`);
    const markdown = fs.readFileSync(markdownPath, "utf8");
    assert.match(markdown, /\breference\b/);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("template build fails with missing template guidance", () => {
  const projectId = `template-missing-${Date.now()}-${process.pid}`;
  const projectRoot = createTempProject(projectId);
  fs.rmSync(path.join(projectRoot, "templates"), { recursive: true, force: true });

  try {
    const result = runCli(["template", "build", "--project", projectId]);
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /templates\/book\.template\.tsx/);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("template export writes docx, latex, and pdf through the shared pandoc path", () => {
  const projectId = `template-export-${Date.now()}-${process.pid}`;
  const projectRoot = createTempProject(projectId);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stego-template-pandoc-"));
  const argsPath = path.join(tempDir, "pandoc-args.txt");
  const fakePandocPath = path.join(tempDir, "pandoc");
  const fakePdfEnginePath = path.join(tempDir, "tectonic");

  writeFile(fakePdfEnginePath, "#!/usr/bin/env bash\nexit 0\n");
  fs.chmodSync(fakePdfEnginePath, 0o755);
  writeFile(fakePandocPath, `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "--version" ]]; then
  echo "pandoc 3.0"
  exit 0
fi
printf '%s\n' "$@" > "${argsPath}"
out=""
while [[ "$#" -gt 0 ]]; do
  if [[ "$1" == "-o" && "$#" -gt 1 ]]; then
    out="$2"
    shift 2
    continue
  fi
  shift
done
  if [[ -n "$out" ]]; then
    mkdir -p "$(dirname "$out")"
  if [[ "$out" == *.docx ]]; then
    node - "$out" <<'NODE'
const fs = require('node:fs');
const JSZip = require('jszip');

const outputPath = process.argv[2];
const zip = new JSZip();
zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>');
zip.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body></w:body></w:document>');
zip.generateAsync({ type: 'nodebuffer' }).then((buffer) => fs.writeFileSync(outputPath, buffer));
NODE
  else
    : > "$out"
  fi
fi
`);
  fs.chmodSync(fakePandocPath, 0o755);

  try {
    const docx = runCli(["template", "export", "--project", projectId, "--format", "docx"], {
      env: { PATH: `${tempDir}:${process.env.PATH || ""}` }
    });
    assert.equal(docx.status, 0, `${docx.stdout}\n${docx.stderr}`);
    assert.equal(
      fs.existsSync(path.join(projectRoot, "dist", "exports", `${projectId}.template.docx`)),
      true
    );

    const latex = runCli(["template", "export", "--project", projectId, "--format", "latex"], {
      env: { PATH: `${tempDir}:${process.env.PATH || ""}` }
    });
    assert.equal(latex.status, 0, `${latex.stdout}\n${latex.stderr}`);
    assert.equal(
      fs.existsSync(path.join(projectRoot, "dist", "exports", `${projectId}.template.tex`)),
      true
    );

    const pdf = runCli(["template", "export", "--project", projectId, "--format", "pdf"], {
      env: { PATH: `${tempDir}:${process.env.PATH || ""}` }
    });
    assert.equal(pdf.status, 0, `${pdf.stdout}\n${pdf.stderr}`);

    const outputPath = path.join(projectRoot, "dist", "exports", `${projectId}.template.pdf`);
    assert.equal(fs.existsSync(outputPath), true);

    const recordedArgs = fs.readFileSync(argsPath, "utf8").split(/\r?\n/).filter(Boolean);
    const fromIndex = recordedArgs.findIndex((entry) => entry === "--from");
    assert.ok(fromIndex >= 0, "Expected --from");
    assert.equal(recordedArgs[fromIndex + 1], "markdown+bracketed_spans-implicit_figures");
    const metadataIndex = recordedArgs.findIndex((entry) => entry === "--metadata-file");
    assert.ok(metadataIndex >= 0, "Expected --metadata-file");
    const luaFilters = recordedArgs
      .flatMap((entry, index) => entry === "--lua-filter" ? [recordedArgs[index + 1]] : [])
      .filter(Boolean);
    assert.equal(luaFilters.length >= 2, true, "Expected template export lua filters");
    assert.ok(luaFilters.some((value) => /filters[\\/]+image-layout\.lua$/.test(value)), "Expected image-layout filter");
    assert.ok(luaFilters.some((value) => /filters[\\/]+block-layout\.lua$/.test(value)), "Expected block-layout filter");
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("template export requires xelatex when the template requests a font family", () => {
  const projectId = `template-export-fonts-${Date.now()}-${process.pid}`;
  const projectRoot = createTempProject(projectId);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stego-template-pandoc-fonts-"));
  const argsPath = path.join(tempDir, "pandoc-args.txt");
  const fakePandocPath = path.join(tempDir, "pandoc");
  const fakeXelatexPath = path.join(tempDir, "xelatex");

  writeFile(path.join(projectRoot, "templates", "book.template.tsx"), `import { defineTemplate, Stego } from "@stego-labs/engine";
export default defineTemplate((ctx) => (
  <Stego.Document
    page={{ size: "letter", margin: "1in" }}
    bodyStyle={{ fontFamily: "Times New Roman", fontSize: "12pt", lineSpacing: 2 }}
  >
    {ctx.allLeaves.map((leaf) => (
      <Stego.Section bodyStyle={{ firstLineIndent: "0.5in" }}>
        <Stego.Markdown leaf={leaf} />
      </Stego.Section>
    ))}
  </Stego.Document>
));
`);

  writeFile(fakeXelatexPath, "#!/usr/bin/env bash\nexit 0\n");
  fs.chmodSync(fakeXelatexPath, 0o755);
  writeFile(fakePandocPath, `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "--version" ]]; then
  echo "pandoc 3.0"
  exit 0
fi
printf '%s\n' "$@" > "${argsPath}"
out=""
while [[ "$#" -gt 0 ]]; do
  if [[ "$1" == "-o" && "$#" -gt 1 ]]; then
    out="$2"
    shift 2
    continue
  fi
  shift
done
if [[ -n "$out" ]]; then
  mkdir -p "$(dirname "$out")"
  : > "$out"
fi
`);
  fs.chmodSync(fakePandocPath, 0o755);

  try {
    const pdf = runCli(["template", "export", "--project", projectId, "--format", "pdf"], {
      env: { PATH: `${tempDir}:${process.env.PATH || ""}` }
    });
    assert.equal(pdf.status, 0, `${pdf.stdout}\n${pdf.stderr}`);

    const recordedArgs = fs.readFileSync(argsPath, "utf8").split(/\r?\n/).filter(Boolean);
    assert.ok(recordedArgs.includes("--pdf-engine=xelatex"), "Expected xelatex PDF engine for font-aware templates");
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("template export fails clearly when xelatex is missing for font-aware pdf export", () => {
  const projectId = `template-export-fonts-missing-${Date.now()}-${process.pid}`;
  const projectRoot = createTempProject(projectId);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stego-template-pandoc-fonts-missing-"));
  const fakePandocPath = path.join(tempDir, "pandoc");
  const fakeWhichPath = path.join(tempDir, "which");

  writeFile(path.join(projectRoot, "templates", "book.template.tsx"), `import { defineTemplate, Stego } from "@stego-labs/engine";
export default defineTemplate((ctx) => (
  <Stego.Document page={{ size: "letter", margin: "1in" }} bodyStyle={{ fontFamily: "Times New Roman" }}>
    {ctx.allLeaves.map((leaf) => (
      <Stego.Markdown leaf={leaf} />
    ))}
  </Stego.Document>
));
`);

  writeFile(fakePandocPath, `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "--version" ]]; then
  echo "pandoc 3.0"
  exit 0
fi
exit 1
`);
  fs.chmodSync(fakePandocPath, 0o755);
  writeFile(fakeWhichPath, `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "xelatex" ]]; then
  exit 1
fi
command -v "$1"
`);
  fs.chmodSync(fakeWhichPath, 0o755);

  try {
    const pdf = runCli(["template", "export", "--project", projectId, "--format", "pdf"], {
      env: { PATH: `${tempDir}:${process.env.PATH || ""}` }
    });
    assert.equal(pdf.status, 1, `${pdf.stdout}\n${pdf.stderr}`);
    assert.match(`${pdf.stdout}\n${pdf.stderr}`, /requires xelatex/i);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

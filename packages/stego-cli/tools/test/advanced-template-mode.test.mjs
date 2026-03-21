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

function createAdvancedProject(projectId, extraTemplates = []) {
  // Test fixture shape:
  // book.template.tsx   -> deterministic markdown/default lane
  // print.template.tsx  -> docx/pdf target-aware lane
  // ebook.template.tsx  -> epub target-aware lane
  const projectRoot = path.join(repoRoot, "projects", projectId);
  fs.mkdirSync(path.join(projectRoot, "content"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "notes"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "dist"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "templates"), { recursive: true });

  writeFile(path.join(projectRoot, "stego-project.json"), `${JSON.stringify({
    id: projectId,
    title: "Advanced Template Test"
  }, null, 2)}\n`);

  writeFile(path.join(projectRoot, "content", "100-scene.md"), `---
id: CH-OPENING
status: draft
---

Hello advanced templates.
`);

  writeFile(path.join(projectRoot, "templates", "book.template.tsx"), `import { defineTemplate, Stego } from "@stego-labs/engine";

export default defineTemplate((ctx) => (
  <Stego.Document>
    <Stego.Heading level={1}>BOOK DEFAULT</Stego.Heading>
    {ctx.allLeaves.map((leaf) => <Stego.Markdown leaf={leaf} />)}
  </Stego.Document>
));
`);

  writeFile(path.join(projectRoot, "templates", "print.template.tsx"), `import { defineTemplate } from "@stego-labs/engine";

export default defineTemplate(
  { targets: ["docx", "pdf", "latex"] },
  (ctx, Stego) => (
    <Stego.Document page={{ size: "6x9", margin: "0.75in" }}>
      <Stego.PageTemplate footer={{ right: <Stego.PageNumber /> }} />
      <Stego.Heading level={1}>PRINT TEMPLATE</Stego.Heading>
      {ctx.allLeaves.map((leaf) => <Stego.Markdown leaf={leaf} />)}
    </Stego.Document>
  )
);
`);

  writeFile(path.join(projectRoot, "templates", "ebook.template.tsx"), `import { defineTemplate } from "@stego-labs/engine";

export default defineTemplate(
  { targets: ["epub"] },
  (ctx, Stego) => (
    <Stego.Document>
      <Stego.Heading level={1}>EBOOK TEMPLATE</Stego.Heading>
      {ctx.allLeaves.map((leaf) => <Stego.Markdown leaf={leaf} />)}
    </Stego.Document>
  )
);
`);

  for (const [name, content] of extraTemplates) {
    writeFile(path.join(projectRoot, "templates", name), content);
  }

  return projectRoot;
}

function createPandocStub() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stego-advanced-pandoc-"));
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

  return tempDir;
}

test("build auto-discovers advanced templates and writes per-template artifacts", () => {
  const projectId = `advanced-build-${Date.now()}-${process.pid}`;
  const projectRoot = createAdvancedProject(projectId);

  try {
    const result = runCli(["build", "--project", projectId]);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

    const defaultMarkdown = fs.readFileSync(path.join(projectRoot, "dist", `${projectId}.md`), "utf8");
    const printMarkdown = fs.readFileSync(path.join(projectRoot, "dist", `${projectId}.print.md`), "utf8");
    const ebookMarkdown = fs.readFileSync(path.join(projectRoot, "dist", `${projectId}.ebook.md`), "utf8");

    assert.match(defaultMarkdown, /BOOK DEFAULT/);
    assert.match(printMarkdown, /PRINT TEMPLATE/);
    assert.match(ebookMarkdown, /EBOOK TEMPLATE/);
    assert.equal(fs.existsSync(path.join(projectRoot, "dist", `${projectId}.render-plan.json`)), true);
    assert.equal(fs.existsSync(path.join(projectRoot, "dist", `${projectId}.print.render-plan.json`)), true);
    assert.equal(fs.existsSync(path.join(projectRoot, "dist", `${projectId}.ebook.render-plan.json`)), true);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("export md keeps the deterministic book template path when multiple templates exist", () => {
  const projectId = `advanced-md-export-${Date.now()}-${process.pid}`;
  const projectRoot = createAdvancedProject(projectId);

  try {
    const result = runCli(["export", "--project", projectId, "--format", "md"]);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

    const exportedMarkdown = fs.readFileSync(path.join(projectRoot, "dist", "exports", `${projectId}.md`), "utf8");
    assert.match(exportedMarkdown, /BOOK DEFAULT/);
    assert.doesNotMatch(exportedMarkdown, /PRINT TEMPLATE/);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("export resolves the unique matching advanced template for presentation targets", () => {
  const projectId = `advanced-pdf-export-${Date.now()}-${process.pid}`;
  const projectRoot = createAdvancedProject(projectId);
  const tempDir = createPandocStub();

  try {
    const result = runCli(["export", "--project", projectId, "--format", "pdf"], {
      env: { PATH: `${tempDir}:${process.env.PATH || ""}` }
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

    const latex = runCli(["export", "--project", projectId, "--format", "latex"], {
      env: { PATH: `${tempDir}:${process.env.PATH || ""}` }
    });
    assert.equal(latex.status, 0, `${latex.stdout}\n${latex.stderr}`);

    const printMarkdown = fs.readFileSync(path.join(projectRoot, "dist", `${projectId}.print.md`), "utf8");
    assert.match(printMarkdown, /PRINT TEMPLATE/);
    assert.equal(fs.existsSync(path.join(projectRoot, "dist", "exports", `${projectId}.pdf`)), true);
    assert.equal(fs.existsSync(path.join(projectRoot, "dist", "exports", `${projectId}.tex`)), true);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("explicit template export rejects incompatible declared presentation targets", () => {
  const projectId = `advanced-explicit-mismatch-${Date.now()}-${process.pid}`;
  const projectRoot = createAdvancedProject(projectId);

  try {
    const result = runCli([
      "export",
      "--project", projectId,
      "--template", "templates/ebook.template.tsx",
      "--format", "pdf"
    ]);
    assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /declares epub and cannot be exported as 'pdf'/);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("export errors clearly when multiple discovered templates support the same presentation target", () => {
  const projectId = `advanced-ambiguous-export-${Date.now()}-${process.pid}`;
  const projectRoot = createAdvancedProject(projectId, [[
    "alt-print.template.tsx",
    `import { defineTemplate } from "@stego-labs/engine";

export default defineTemplate(
  { targets: ["pdf"] },
  (_ctx, Stego) => (
    <Stego.Document>
      <Stego.Heading level={1}>ALT PRINT TEMPLATE</Stego.Heading>
    </Stego.Document>
  )
);
`
  ]]);

  try {
    const result = runCli(["export", "--project", projectId, "--format", "pdf"]);
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /Multiple auto-discovered templates support 'pdf'/);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("validate fails when auto-discovered templates omit book.template.tsx", () => {
  const projectId = `advanced-missing-book-${Date.now()}-${process.pid}`;
  const projectRoot = createAdvancedProject(projectId);
  fs.rmSync(path.join(projectRoot, "templates", "book.template.tsx"), { force: true });

  try {
    const result = runCli(["validate", "--project", projectId]);
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /must keep 'templates\/book\.template\.tsx'/);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("validate fails when a discovered advanced template is missing target declarations", () => {
  const projectId = `advanced-missing-targets-${Date.now()}-${process.pid}`;
  const projectRoot = createAdvancedProject(projectId, [[
    "notes.template.tsx",
    `import { defineTemplate, Stego } from "@stego-labs/engine";

export default defineTemplate((ctx) => (
  <Stego.Document>
    <Stego.Heading level={1}>MISSING TARGETS</Stego.Heading>
    {ctx.allLeaves.map((leaf) => <Stego.Markdown leaf={leaf} />)}
  </Stego.Document>
));
`
  ]]);

  try {
    const result = runCli(["validate", "--project", projectId]);
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /must declare presentation targets/);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const projectsDir = path.join(repoRoot, "projects");
const cliPath = path.join(repoRoot, "tools", "stego-cli.ts");

function runCli(args, options = {}) {
  return spawnSync("node", ["--experimental-strip-types", cliPath, ...args], {
    cwd: options.cwd || repoRoot,
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

function createTempProject(projectId, projectJson, contentFiles = [], extraFiles = []) {
  const projectRoot = path.join(projectsDir, projectId);
  fs.mkdirSync(path.join(projectRoot, "content"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "notes"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "assets"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "dist"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "templates"), { recursive: true });

  const { requiredMetadata, ...projectMeta } = projectJson;
  writeFile(path.join(projectRoot, "stego-project.json"), `${JSON.stringify(projectMeta, null, 2)}\n`);
  if (Array.isArray(requiredMetadata) && requiredMetadata.length > 0) {
    writeFile(
      path.join(projectRoot, "content", "_branch.md"),
      `---\nlabel: Content\nleafPolicy:\n  requiredMetadata:\n${requiredMetadata.map((key) => `    - ${key}`).join("\n")}\n---\n`
    );
  }
  writeFile(
    path.join(projectRoot, "templates", "book.template.tsx"),
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

  for (const [name, content] of contentFiles) {
    writeFile(path.join(projectRoot, "content", name), content);
  }

  for (const [relativePath, content] of extraFiles) {
    const targetPath = path.join(projectRoot, relativePath);
    if (content === null) {
      fs.mkdirSync(targetPath, { recursive: true });
    } else {
      writeFile(targetPath, content);
    }
  }

  return projectRoot;
}

test("metadata apply/read supports nested images frontmatter objects", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stego-images-meta-"));
  const markdownPath = path.join(tempDir, "sample.md");
  const payloadPath = path.join(tempDir, "payload.json");

  writeFile(markdownPath, "---\nstatus: draft\n---\n\nHello.\n");
  writeFile(
    payloadPath,
    `${JSON.stringify({
      frontmatter: {
        status: "draft",
        images: {
          layout: "block",
          align: "center",
          width: "50%",
          attrs: {
            "data-layout": "inline"
          },
          "assets/maps/city-plan.png": {
            layout: "inline",
            align: "left",
            width: "100%",
            classes: ["full-bleed"]
          }
        }
      },
      body: "Body text.\n"
    })}\n`
  );

  const apply = runCli(["metadata", "apply", markdownPath, "--input", payloadPath, "--format", "json"]);
  assert.equal(apply.status, 0, `${apply.stdout}\n${apply.stderr}`);

  const read = runCli(["metadata", "read", markdownPath, "--format", "json"]);
  assert.equal(read.status, 0, `${read.stdout}\n${read.stderr}`);
  const payload = JSON.parse(read.stdout.trim());

  assert.equal(payload.ok, true);
  assert.equal(payload.operation, "read");
  assert.equal(payload.state.frontmatter.images.layout, "block");
  assert.equal(payload.state.frontmatter.images.align, "center");
  assert.equal(payload.state.frontmatter.images.width, "50%");
  assert.equal(payload.state.frontmatter.images.attrs["data-layout"], "inline");
  assert.equal(payload.state.frontmatter.images["assets/maps/city-plan.png"].layout, "inline");
  assert.equal(payload.state.frontmatter.images["assets/maps/city-plan.png"].align, "left");
  assert.equal(payload.state.frontmatter.images["assets/maps/city-plan.png"].width, "100%");
  assert.deepEqual(payload.state.frontmatter.images["assets/maps/city-plan.png"].classes, ["full-bleed"]);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("build applies global and per-path image settings and keeps inline overrides", () => {
  const projectId = `image-build-${Date.now()}-${process.pid}`;
  const projectRoot = createTempProject(
    projectId,
    {
      id: projectId,
      title: "Image Build Test",
      requiredMetadata: ["status"],
      images: {
        layout: "block",
        align: "center",
        width: "50%"
      }
    },
    [["100-scene.md", `---
id: CH-IMAGE-BUILD
status: draft
title: Scene
images:
  assets/maps/city-plan.png:
    layout: inline
    align: left
    width: 100%
---

![Map](../assets/maps/city-plan.png)
![Sketch](../assets/maps/sketch.png)
![Inline](../assets/maps/city-plan.png){width=25%}
`]],
    [
      ["assets/maps/city-plan.png", ""],
      ["assets/maps/sketch.png", ""]
    ]
  );

  try {
    const result = runCli(["build", "--project", projectId]);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

    const builtPath = path.join(projectRoot, "dist", `${projectId}.md`);
    const built = fs.readFileSync(builtPath, "utf8");

    assert.match(built, /!\[Map\]\(\.\.\/assets\/maps\/city-plan\.png\)\{[^}]*width=100%[^}]*data-align=left[^}]*data-layout=inline[^}]*\}/);
    assert.match(built, /!\[Sketch\]\(\.\.\/assets\/maps\/sketch\.png\)\{[^}]*width=50%[^}]*data-align=center[^}]*data-layout=block[^}]*\}/);
    assert.match(built, /!\[Inline\]\(\.\.\/assets\/maps\/city-plan\.png\)\{[^}]*width=25%[^}]*data-align=left[^}]*data-layout=inline[^}]*\}/);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("build treats align-only defaults as block layout", () => {
  const projectId = `image-align-block-${Date.now()}-${process.pid}`;
  const projectRoot = createTempProject(
    projectId,
    {
      id: projectId,
      title: "Image Align Block Test",
      requiredMetadata: ["status"],
      images: {
        align: "right",
        width: "75%"
      }
    },
    [["100-scene.md", `---
id: CH-IMAGE-ALIGN
status: draft
---

![Sketch](../assets/maps/sketch.png)
`]],
    [["assets/maps/sketch.png", ""]]
  );

  try {
    const result = runCli(["build", "--project", projectId]);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

    const builtPath = path.join(projectRoot, "dist", `${projectId}.md`);
    const built = fs.readFileSync(builtPath, "utf8");

    assert.match(built, /!\[Sketch\]\(\.\.\/assets\/maps\/sketch\.png\)\{[^}]*width=75%[^}]*data-align=right[^}]*data-layout=block[^}]*\}/);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("validate warns when leaf frontmatter uses reserved global image key", () => {
  const projectId = `image-reserved-key-${Date.now()}-${process.pid}`;
  const projectRoot = createTempProject(
    projectId,
    {
      id: projectId,
      title: "Image Reserved Key Test",
      requiredMetadata: ["status"]
    },
    [["100-scene.md", `---
id: CH-IMAGE-RESERVED
status: draft
images:
  width: 90%
---

Hello.
`]]
  );

  try {
    const result = runCli(["validate", "--project", projectId]);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const output = `${result.stdout}\n${result.stderr}`;
    assert.match(output, /Leaf frontmatter 'images\.width' is reserved for project defaults\./);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("validate warns when project image defaults are misconfigured", () => {
  const projectId = `image-project-defaults-${Date.now()}-${process.pid}`;
  const projectRoot = createTempProject(
    projectId,
    {
      id: projectId,
      title: "Image Project Defaults Test",
      requiredMetadata: ["status"],
      images: {
        width: { value: "50%" },
        layout: "top",
        "assets/maps/city-plan.png": {
          width: "100%"
        }
      }
    },
    [["100-scene.md", `---
id: CH-IMAGE-PROJECT-DEFAULTS
status: draft
---

Hello.
`]]
  );

  try {
    const result = runCli(["validate", "--project", projectId]);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const output = `${result.stdout}\n${result.stderr}`;
    assert.match(output, /Metadata 'images\.width' must be a scalar value\./);
    assert.match(output, /Metadata 'images\.layout' must be either 'block' or 'inline'\./);
    assert.match(output, /Project image defaults do not support key 'images\.assets\/maps\/city-plan\.png'\./);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("validate warns for local image targets outside assets and does not warn for external URLs", () => {
  const projectId = `image-assets-policy-${Date.now()}-${process.pid}`;
  const projectRoot = createTempProject(
    projectId,
    {
      id: projectId,
      title: "Image Assets Policy Test",
      requiredMetadata: ["status"]
    },
    [["100-scene.md", `---
id: CH-IMAGE-ASSETS
status: draft
---

![Outside](../notes/diagram.png)
![Remote](https://example.com/cover.png)
`]],
    [["notes/diagram.png", ""]]
  );

  try {
    const result = runCli(["validate", "--project", projectId]);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const output = `${result.stdout}\n${result.stderr}`;
    assert.match(output, /\[WARNING\]\[assets\].*outside project assets\//);

    const assetsLines = output
      .split(/\r?\n/)
      .filter((line) => line.includes("[assets]"));
    assert.equal(assetsLines.length, 1);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("export passes project-aware resource paths to pandoc", () => {
  const projectId = `image-export-${Date.now()}-${process.pid}`;
  const projectRoot = createTempProject(
    projectId,
    {
      id: projectId,
      title: "Image Export Test",
      requiredMetadata: ["status"]
    },
    [["100-scene.md", `---
id: CH-IMAGE-EXPORT
status: draft
---

![Map](../assets/maps/city-plan.png)
`]],
    [["assets/maps/city-plan.png", ""]]
  );

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stego-pandoc-stub-"));
  const argsPath = path.join(tempDir, "pandoc-args.txt");
  const cwdPath = path.join(tempDir, "pandoc-cwd.txt");
  const fakePandocPath = path.join(tempDir, "pandoc");

  writeFile(
    fakePandocPath,
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "--version" ]]; then
  echo "pandoc 3.0"
  exit 0
fi
printf '%s\n' "$@" > "${argsPath}"
pwd > "${cwdPath}"
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
  python3 - "$out" <<'PY'
import sys
import zipfile

out = sys.argv[1]
with zipfile.ZipFile(out, "w") as archive:
    archive.writestr(
        "[Content_Types].xml",
        """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>"""
    )
    archive.writestr(
        "_rels/.rels",
        """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""
    )
    archive.writestr(
        "word/document.xml",
        """<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>stub</w:t></w:r></w:p>
    <w:sectPr/>
  </w:body>
</w:document>"""
    )
    archive.writestr(
        "word/styles.xml",
        """<?xml version="1.0" encoding="UTF-8"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Normal" w:default="1">
    <w:name w:val="Normal"/>
  </w:style>
</w:styles>"""
    )
PY
fi
`
  );
  fs.chmodSync(fakePandocPath, 0o755);

  try {
    const result = runCli(
      ["export", "--project", projectId, "--format", "docx"],
      {
        env: {
          PATH: `${tempDir}:${process.env.PATH || ""}`
        }
      }
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

    const recordedArgs = fs.readFileSync(argsPath, "utf8").split(/\r?\n/).filter(Boolean);
    const luaFilterIndex = recordedArgs.findIndex((entry) => entry === "--lua-filter");
    assert.ok(luaFilterIndex >= 0, "Expected --lua-filter arg");
    const luaFilterPath = recordedArgs[luaFilterIndex + 1];
    assert.ok(luaFilterPath, "Expected lua filter path after --lua-filter");
    assert.match(luaFilterPath, /filters[\\/]+image-layout\.lua$/);

    const resourceArg = recordedArgs.find((entry) => entry.startsWith("--resource-path="));
    assert.ok(resourceArg, "Expected --resource-path arg");

    const resourcePaths = resourceArg.replace("--resource-path=", "").split(path.delimiter);
    assert.ok(resourcePaths.includes(path.resolve(projectRoot)), "Expected project root in resource path");
    assert.ok(resourcePaths.includes(path.resolve(projectRoot, "content")), "Expected content dir in resource path");
    assert.ok(resourcePaths.includes(path.resolve(projectRoot, "assets")), "Expected assets dir in resource path");

    const recordedCwd = fs.readFileSync(cwdPath, "utf8").trim();
    assert.equal(recordedCwd, path.resolve(projectRoot));
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("epub export passes bundled image-layout stylesheet to pandoc", () => {
  const projectId = `image-export-epub-${Date.now()}-${process.pid}`;
  const projectRoot = createTempProject(
    projectId,
    {
      id: projectId,
      title: "Image Export EPUB Test",
      requiredMetadata: ["status"]
    },
    [["100-scene.md", `---
id: CH-IMAGE-EPUB
status: draft
---

![Map](../assets/maps/city-plan.png)
`]],
    [["assets/maps/city-plan.png", ""]]
  );

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stego-pandoc-stub-epub-"));
  const argsPath = path.join(tempDir, "pandoc-args.txt");
  const fakePandocPath = path.join(tempDir, "pandoc");

  writeFile(
    fakePandocPath,
    `#!/usr/bin/env bash
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
`
  );
  fs.chmodSync(fakePandocPath, 0o755);

  try {
    const result = runCli(
      ["export", "--project", projectId, "--format", "epub"],
      {
        env: {
          PATH: `${tempDir}:${process.env.PATH || ""}`
        }
      }
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

    const recordedArgs = fs.readFileSync(argsPath, "utf8").split(/\r?\n/).filter(Boolean);
    const cssIndex = recordedArgs.findIndex((entry) => entry === "--css");
    assert.ok(cssIndex >= 0, "Expected --css arg for EPUB export");
    const cssPath = recordedArgs[cssIndex + 1];
    assert.ok(cssPath, "Expected css path after --css");
    assert.match(cssPath, /filters[\\/]+image-layout\.css$/);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("new-project scaffolds assets README", () => {
  const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "stego-new-project-assets-"));
  const projectId = `assets-${Date.now()}-${process.pid}`;

  writeFile(path.join(tempWorkspace, "stego.config.json"), `${JSON.stringify({
    projectsDir: "projects",
        contentDir: "content",
        notesDir: "notes",
        distDir: "dist",
        requiredMetadata: ["status"],
        allowedStatuses: ["draft", "revise", "line-edit", "proof", "final"],
        stagePolicies: {
          draft: {
            minimumChapterStatus: "draft",
            enforceMarkdownlint: false,
            enforceCSpell: false,
            enforceLocalLinks: false
      }
    }
  }, null, 2)}\n`);
  fs.mkdirSync(path.join(tempWorkspace, "projects"), { recursive: true });

  try {
    const result = runCli([
      "new-project",
      "--root",
      tempWorkspace,
      "--project",
      projectId,
      "--prose-font",
      "no"
    ]);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

    const assetsReadmePath = path.join(tempWorkspace, "projects", projectId, "assets", "README.md");
    assert.equal(fs.existsSync(assetsReadmePath), true, `Expected assets README at ${assetsReadmePath}`);
  } finally {
    fs.rmSync(tempWorkspace, { recursive: true, force: true });
  }
});

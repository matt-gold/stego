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
    ...options
  });
}

function writeWorkspaceConfig(workspaceRoot) {
  fs.writeFileSync(
    path.join(workspaceRoot, "stego.config.json"),
    `${JSON.stringify(
      {
        projectsDir: "projects",
        contentDir: "content",
        notesDir: "notes",
        distDir: "dist",
        allowedStatuses: ["draft", "revise", "line-edit", "proof", "final"],
        stagePolicies: {
          draft: {
            minimumChapterStatus: "draft",
            enforceMarkdownlint: false,
            enforceCSpell: false,
            enforceLocalLinks: false
          }
        }
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

function writeProject(workspaceRoot, projectId) {
  const projectRoot = path.join(workspaceRoot, "projects", projectId);
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.writeFileSync(
    path.join(projectRoot, "stego-project.json"),
    `${JSON.stringify({ id: projectId, title: projectId }, null, 2)}\n`,
    "utf8"
  );
}

test("list-projects resolves projects from explicit --root", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stego-workspace-list-"));
  try {
    writeWorkspaceConfig(tempDir);
    writeProject(tempDir, "alpha");
    writeProject(tempDir, "beta");

    const result = runCli(["list-projects", "--root", tempDir]);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Projects:/);
    assert.match(result.stdout, /- alpha/);
    assert.match(result.stdout, /- beta/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("new-project creates scaffold and returns JSON envelope", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stego-workspace-new-project-"));
  try {
    writeWorkspaceConfig(tempDir);
    fs.mkdirSync(path.join(tempDir, "projects"), { recursive: true });

    const result = runCli([
      "new-project",
      "--root",
      tempDir,
      "--project",
      "my-book",
      "--title",
      "My Book",
      "--prose-font",
      "no",
      "--format",
      "json"
    ]);

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.operation, "new-project");
    assert.equal(payload.result.projectId, "my-book");

    const projectRoot = path.join(tempDir, "projects", "my-book");
    assert.equal(fs.existsSync(path.join(projectRoot, "stego-project.json")), true);
    assert.equal(fs.existsSync(path.join(projectRoot, "package.json")), true);
    assert.equal(fs.existsSync(path.join(projectRoot, "tsconfig.json")), true);
    assert.equal(fs.existsSync(path.join(projectRoot, "content", "manuscript", "_branch.md")), true);
    assert.equal(fs.existsSync(path.join(projectRoot, "content", "reference", "_branch.md")), true);
    assert.equal(fs.existsSync(path.join(projectRoot, "content", "manuscript", "100-hello-world.md")), true);
    assert.equal(fs.existsSync(path.join(projectRoot, "templates", "book.template.tsx")), true);
    assert.equal(fs.existsSync(path.join(projectRoot, "content", "reference")), true);
    assert.equal(fs.existsSync(path.join(projectRoot, ".vscode", "extensions.json")), true);
    assert.equal(fs.existsSync(path.join(projectRoot, ".vscode", "settings.json")), false);

    const templateSource = fs.readFileSync(path.join(projectRoot, "templates", "book.template.tsx"), "utf8");
    assert.doesNotMatch(templateSource, /kind:\s*"reference"/);
    assert.match(templateSource, /const chapterLeaves = ctx\.allLeaves\.filter\(\(leaf\) => leaf\.metadata\.kind !== "reference"\);/);

    const projectJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "stego-project.json"), "utf8"));
    assert.equal("compileStructure" in projectJson, false);
    assert.equal("requiredMetadata" in projectJson, false);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("new-project accepts -p shorthand for project id", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stego-workspace-new-project-short-"));
  try {
    writeWorkspaceConfig(tempDir);
    fs.mkdirSync(path.join(tempDir, "projects"), { recursive: true });

    const result = runCli([
      "new-project",
      "--root",
      tempDir,
      "-p",
      "short-book",
      "--prose-font",
      "no",
      "--format",
      "json"
    ]);

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.operation, "new-project");
    assert.equal(payload.result.projectId, "short-book");
    assert.equal(
      fs.existsSync(path.join(tempDir, "projects", "short-book", "stego-project.json")),
      true
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("init scaffolds a workspace in current directory", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stego-init-workspace-"));
  try {
    const result = runCli(["init", "--force"], { cwd: tempDir });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Initialized Stego workspace in/);

    assert.equal(fs.existsSync(path.join(tempDir, "stego.config.json")), true);
    assert.equal(fs.existsSync(path.join(tempDir, "package.json")), true);
    assert.equal(fs.existsSync(path.join(tempDir, "projects")), true);
    assert.equal(fs.existsSync(path.join(tempDir, ".markdownlint.json")), true);

    const packageJson = JSON.parse(fs.readFileSync(path.join(tempDir, "package.json"), "utf8"));
    assert.equal(typeof packageJson.devDependencies["@stego-labs/engine"], "string");
    assert.equal(typeof packageJson.devDependencies.typescript, "string");
    assert.equal(typeof packageJson.devDependencies["@types/node"], "string");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

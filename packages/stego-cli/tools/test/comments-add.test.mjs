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

function runCli(args, input) {
  return spawnSync("node", ["--experimental-strip-types", cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    input
  });
}

test("comments add appends first comment block and returns json", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stego-comments-add-"));
  const manuscriptPath = path.join(tempDir, "chapter.md");
  fs.writeFileSync(
    manuscriptPath,
    "---\nstatus: draft\n---\n\nA short scene.\n",
    "utf8"
  );

  try {
    const result = runCli([
      "comments",
      "add",
      manuscriptPath,
      "--message",
      "Could this transition be clearer?",
      "--start-line",
      "4",
      "--start-col",
      "0",
      "--end-line",
      "4",
      "--end-col",
      "12",
      "--format",
      "json"
    ]);

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.ok, true);
    assert.equal(payload.commentId, "CMT-0001");
    assert.equal(payload.anchor.type, "selection");

    const updated = fs.readFileSync(manuscriptPath, "utf8");
    assert.match(updated, /<!-- stego-comments:start -->/);
    assert.match(updated, /### CMT-0001/);
    assert.match(updated, /Could this transition be clearer\?/);
    assert.match(updated, /<!-- meta64: /);
    assert.match(updated, /<!-- stego-comments:end -->/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("comments add rejects non-stego manuscripts with code 3", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stego-comments-add-"));
  const manuscriptPath = path.join(tempDir, "notes.md");
  fs.writeFileSync(
    manuscriptPath,
    "Plain markdown without stego frontmatter.\n",
    "utf8"
  );

  try {
    const result = runCli([
      "comments",
      "add",
      manuscriptPath,
      "--message",
      "Could this be tightened?",
      "--format",
      "json"
    ]);

    assert.equal(result.status, 3, `${result.stdout}\n${result.stderr}`);
    const payload = JSON.parse(result.stderr.trim());
    assert.equal(payload.ok, false);
    assert.equal(payload.code, "NOT_STEGO_MANUSCRIPT");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("comments add accepts --input - from stdin", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stego-comments-add-"));
  const manuscriptPath = path.join(tempDir, "chapter.md");
  fs.writeFileSync(
    manuscriptPath,
    "---\nstatus: draft\n---\n\nA short scene.\n",
    "utf8"
  );

  try {
    const inputPayload = JSON.stringify({
      message: "Should this sentence land with more impact?",
      range: {
        start: { line: 4, col: 0 },
        end: { line: 4, col: 15 }
      }
    });

    const result = runCli(
      [
        "comments",
        "add",
        manuscriptPath,
        "--input",
        "-",
        "--format",
        "json"
      ],
      inputPayload
    );

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.ok, true);
    assert.equal(payload.commentId, "CMT-0001");
    assert.equal(payload.anchor.type, "selection");

    const updated = fs.readFileSync(manuscriptPath, "utf8");
    assert.match(updated, /Should this sentence land with more impact\?/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

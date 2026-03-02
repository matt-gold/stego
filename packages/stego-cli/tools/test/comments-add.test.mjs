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

function parseJson(stdout) {
  return JSON.parse(stdout.trim());
}

function writeBaselineManuscript(manuscriptPath) {
  fs.writeFileSync(
    manuscriptPath,
    "---\nstatus: draft\n---\n\nFirst paragraph line one.\n\nSecond paragraph.\n",
    "utf8"
  );
}

test("comments read returns deterministic empty state", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stego-comments-read-"));
  const manuscriptPath = path.join(tempDir, "chapter.md");
  writeBaselineManuscript(manuscriptPath);

  try {
    const result = runCli(["comments", "read", manuscriptPath, "--format", "json"]);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

    const payload = parseJson(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.operation, "read");
    assert.equal(payload.state.totalCount, 0);
    assert.equal(payload.state.unresolvedCount, 0);
    assert.deepEqual(payload.state.comments, []);
    assert.deepEqual(payload.state.parseErrors, []);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("comments add with explicit range writes canonical nested excerpt", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stego-comments-add-"));
  const manuscriptPath = path.join(tempDir, "chapter.md");
  writeBaselineManuscript(manuscriptPath);

  try {
    const result = runCli([
      "comments",
      "add",
      manuscriptPath,
      "--message",
      "Could this transition be clearer?",
      "--start-line",
      "5",
      "--start-col",
      "0",
      "--end-line",
      "5",
      "--end-col",
      "10",
      "--format",
      "json"
    ]);

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const payload = parseJson(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.operation, "add");
    assert.equal(payload.commentId, "CMT-0001");
    assert.equal(payload.state.totalCount, 1);
    assert.equal(payload.state.unresolvedCount, 1);

    const updated = fs.readFileSync(manuscriptPath, "utf8");
    assert.match(updated, /<!-- stego-comments:start -->/);
    assert.match(updated, /<!-- comment: CMT-0001 -->/);
    assert.match(updated, /> _[A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2} (AM|PM) — Saurus_/);
    assert.match(updated, /> > “First para”/);
    assert.match(updated, /Could this transition be clearer\?/);
    assert.match(updated, /<!-- stego-comments:end -->/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("comments add supports cursor_line anchor fallback", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stego-comments-cursor-"));
  const manuscriptPath = path.join(tempDir, "chapter.md");
  writeBaselineManuscript(manuscriptPath);

  try {
    const inputPayload = JSON.stringify({
      message: "Anchor by cursor line",
      anchor: {
        cursor_line: 7
      }
    });

    const result = runCli(
      ["comments", "add", manuscriptPath, "--input", "-", "--format", "json"],
      inputPayload
    );

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const payload = parseJson(result.stdout);
    assert.equal(payload.commentId, "CMT-0001");
    assert.equal(payload.state.comments[0].paragraphIndex, 1);

    const updated = fs.readFileSync(manuscriptPath, "utf8");
    assert.match(updated, /> > “Second paragraph\.”/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("comments reply and set-status thread update shared thread", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stego-comments-reply-"));
  const manuscriptPath = path.join(tempDir, "chapter.md");
  writeBaselineManuscript(manuscriptPath);

  try {
    const addResult = runCli([
      "comments",
      "add",
      manuscriptPath,
      "--message",
      "Original",
      "--start-line",
      "5",
      "--start-col",
      "0",
      "--end-line",
      "5",
      "--end-col",
      "10",
      "--format",
      "json"
    ]);
    assert.equal(addResult.status, 0, `${addResult.stdout}\n${addResult.stderr}`);

    const replyResult = runCli([
      "comments",
      "reply",
      manuscriptPath,
      "--comment-id",
      "CMT-0001",
      "--message",
      "Follow-up",
      "--format",
      "json"
    ]);
    assert.equal(replyResult.status, 0, `${replyResult.stdout}\n${replyResult.stderr}`);
    const replyPayload = parseJson(replyResult.stdout);
    assert.equal(replyPayload.commentId, "CMT-0002");

    const setStatus = runCli([
      "comments",
      "set-status",
      manuscriptPath,
      "--comment-id",
      "CMT-0001",
      "--status",
      "resolved",
      "--thread",
      "--format",
      "json"
    ]);
    assert.equal(setStatus.status, 0, `${setStatus.stdout}\n${setStatus.stderr}`);
    const statusPayload = parseJson(setStatus.stdout);
    assert.deepEqual(statusPayload.changedIds.sort(), ["CMT-0001", "CMT-0002"]);
    assert.equal(statusPayload.state.unresolvedCount, 0);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("comments delete and clear-resolved mutate state", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stego-comments-delete-"));
  const manuscriptPath = path.join(tempDir, "chapter.md");
  writeBaselineManuscript(manuscriptPath);

  try {
    runCli([
      "comments",
      "add",
      manuscriptPath,
      "--message",
      "A",
      "--cursor-line",
      "5",
      "--format",
      "json"
    ]);
    runCli([
      "comments",
      "add",
      manuscriptPath,
      "--message",
      "B",
      "--cursor-line",
      "7",
      "--format",
      "json"
    ]);

    const setStatus = runCli([
      "comments",
      "set-status",
      manuscriptPath,
      "--comment-id",
      "CMT-0002",
      "--status",
      "resolved",
      "--format",
      "json"
    ]);
    assert.equal(setStatus.status, 0, `${setStatus.stdout}\n${setStatus.stderr}`);

    const clearResolved = runCli(["comments", "clear-resolved", manuscriptPath, "--format", "json"]);
    assert.equal(clearResolved.status, 0, `${clearResolved.stdout}\n${clearResolved.stderr}`);
    const clearPayload = parseJson(clearResolved.stdout);
    assert.equal(clearPayload.removed, 1);
    assert.equal(clearPayload.state.totalCount, 1);

    const deleted = runCli([
      "comments",
      "delete",
      manuscriptPath,
      "--comment-id",
      "CMT-0001",
      "--format",
      "json"
    ]);
    assert.equal(deleted.status, 0, `${deleted.stdout}\n${deleted.stderr}`);
    const deletePayload = parseJson(deleted.stdout);
    assert.equal(deletePayload.removed, 1);
    assert.equal(deletePayload.state.totalCount, 0);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("comments sync-anchors updates ranges and deletes ids", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stego-comments-sync-"));
  const manuscriptPath = path.join(tempDir, "chapter.md");
  writeBaselineManuscript(manuscriptPath);

  try {
    runCli([
      "comments",
      "add",
      manuscriptPath,
      "--message",
      "A",
      "--start-line",
      "5",
      "--start-col",
      "0",
      "--end-line",
      "5",
      "--end-col",
      "10",
      "--format",
      "json"
    ]);
    runCli([
      "comments",
      "add",
      manuscriptPath,
      "--message",
      "B",
      "--cursor-line",
      "7",
      "--format",
      "json"
    ]);

    const syncPayload = JSON.stringify({
      updates: [
        {
          id: "CMT-0001",
          start: { line: 7, col: 0 },
          end: { line: 7, col: 6 }
        }
      ],
      delete_ids: ["CMT-0002"]
    });

    const sync = runCli([
      "comments",
      "sync-anchors",
      manuscriptPath,
      "--input",
      "-",
      "--format",
      "json"
    ], syncPayload);

    assert.equal(sync.status, 0, `${sync.stdout}\n${sync.stderr}`);
    const syncResult = parseJson(sync.stdout);
    assert.equal(syncResult.updatedCount, 1);
    assert.equal(syncResult.deletedCount, 1);
    assert.equal(syncResult.state.totalCount, 1);
    assert.equal(syncResult.state.comments[0].id, "CMT-0001");
    assert.equal(syncResult.state.comments[0].excerptStartLine, 7);

    const updated = fs.readFileSync(manuscriptPath, "utf8");
    assert.match(updated, /> > “Second”/);
    assert.ok(!updated.includes("CMT-0002"));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("comments add rejects canonical parser errors for mutations", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stego-comments-legacy-"));
  const manuscriptPath = path.join(tempDir, "chapter.md");
  fs.writeFileSync(
    manuscriptPath,
    [
      "---",
      "status: draft",
      "---",
      "",
      "Body.",
      "",
      "<!-- stego-comments:start -->",
      "",
      "### CMT-0001",
      "<!-- meta64: eyJzdGF0dXMiOiJvcGVuIn0 -->",
      "> _Mar 1, 2026, 1:00 AM — Saurus_",
      ">",
      "> Legacy format",
      "",
      "<!-- stego-comments:end -->",
      ""
    ].join("\n"),
    "utf8"
  );

  try {
    const read = runCli(["comments", "read", manuscriptPath, "--format", "json"]);
    assert.equal(read.status, 0, `${read.stdout}\n${read.stderr}`);
    const readPayload = parseJson(read.stdout);
    assert.ok(readPayload.state.parseErrors.length > 0);

    const add = runCli([
      "comments",
      "add",
      manuscriptPath,
      "--message",
      "test",
      "--format",
      "json"
    ]);
    assert.equal(add.status, 5, `${add.stdout}\n${add.stderr}`);
    const errPayload = parseJson(add.stderr);
    assert.equal(errPayload.ok, false);
    assert.equal(errPayload.code, "COMMENT_APPENDIX_INVALID");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

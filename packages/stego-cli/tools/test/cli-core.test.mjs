import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const cliPath = path.join(repoRoot, "tools", "stego-cli.ts");
const packageJsonPath = path.join(repoRoot, "package.json");
const builtCliPath = path.join(repoRoot, "dist", "stego-cli", "src", "main.js");

function runCli(args) {
  return spawnSync("node", ["--experimental-strip-types", cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8"
  });
}

test("help prints command list", () => {
  const result = runCli(["--help"]);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Commands:/);
  assert.match(result.stdout, /validate/);
  assert.match(result.stdout, /metadata read/);
});

test("version prints package version", () => {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const expectedVersion = packageJson.version;

  const result = runCli(["--version"]);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(result.stdout.trim(), expectedVersion);
});

test("unknown command returns INVALID_USAGE exit code", () => {
  const result = runCli(["definitely-not-a-command"]);
  assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /Unknown command 'definitely-not-a-command'/);
});

test("command-specific help exits successfully without unknown-command errors", () => {
  const single = runCli(["new", "--help"]);
  assert.equal(single.status, 0, `${single.stdout}\n${single.stderr}`);
  assert.match(single.stdout, /Usage:\s*\n\s*\$ stego new/);
  assert.doesNotMatch(single.stderr, /Unknown command/);

  const multi = runCli(["content", "read", "--help"]);
  assert.equal(multi.status, 0, `${multi.stdout}\n${multi.stderr}`);
  assert.match(multi.stdout, /Usage:\s*\n\s*\$ stego content read/);
  assert.doesNotMatch(multi.stderr, /Unknown command/);
});

test("unknown command returns JSON error envelope for --format=json", () => {
  const result = runCli(["definitely-not-a-command", "--format=json"]);
  assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
  const payload = JSON.parse(result.stderr.trim());
  assert.equal(payload.ok, false);
  assert.equal(payload.code, "INVALID_USAGE");
  assert.match(payload.message, /Unknown command 'definitely-not-a-command'/);
});

test("core commands reject unknown options", () => {
  const result = runCli(["validate", "--bogus"]);
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /Unknown option `--bogus`/);
});

test("built CLI entrypoint is executable for npx --no-install stego", () => {
  const stats = fs.statSync(builtCliPath);
  assert.notEqual(stats.mode & 0o111, 0, `${builtCliPath} is not executable`);
});

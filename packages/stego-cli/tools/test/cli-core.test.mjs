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
  assert.match(result.stdout, /metadata:read|metadata read/);
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

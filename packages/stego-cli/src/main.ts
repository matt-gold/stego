#!/usr/bin/env node

import process from "node:process";
import { createCliApp } from "./app/create-cli-app.ts";
import { runWithErrorBoundary } from "./app/error-boundary.ts";

const app = createCliApp({
  argv: process.argv.slice(2),
  cwd: process.cwd(),
  env: process.env,
  stdout: process.stdout,
  stderr: process.stderr
});

await runWithErrorBoundary(process.argv.slice(2), async () => {
  await app.run();
});

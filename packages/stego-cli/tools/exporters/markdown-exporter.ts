import fs from "node:fs";
import path from "node:path";
import type { Exporter } from "./exporter-types.ts";

export const markdownExporter: Exporter = {
  id: "md",
  description: "Copy compiled manuscript markdown",
  canRun() {
    return { ok: true };
  },
  run({ inputPath, outputPath }) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.copyFileSync(inputPath, outputPath);
    return { outputPath };
  }
};

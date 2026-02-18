import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { Exporter, ExportFormat } from "./exporter-types.ts";

function hasPandoc(): boolean {
  const result = spawnSync("pandoc", ["--version"], { stdio: "ignore" });
  return result.status === 0;
}

export function createPandocExporter(format: Exclude<ExportFormat, "md">): Exporter {
  return {
    id: format,
    description: `Export ${format.toUpperCase()} with pandoc`,
    canRun() {
      if (!hasPandoc()) {
        return {
          ok: false,
          reason: "pandoc is not installed. Install pandoc to enable docx/pdf exports."
        };
      }
      return { ok: true };
    },
    run({ inputPath, outputPath }) {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      const result = spawnSync("pandoc", [inputPath, "-o", outputPath], {
        encoding: "utf8"
      });

      if (result.status !== 0) {
        const stderr = (result.stderr || "").trim();
        const stdout = (result.stdout || "").trim();
        const details = stderr || stdout || "Unknown pandoc error";
        throw new Error(`pandoc export failed: ${details}`);
      }

      return { outputPath };
    }
  };
}

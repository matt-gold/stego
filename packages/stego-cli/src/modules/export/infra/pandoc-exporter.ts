import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { ExportFormat } from "../types.ts";
import type { Exporter } from "../domain/exporter.ts";

function hasPandoc(): boolean {
  const result = spawnSync("pandoc", ["--version"], { stdio: "ignore" });
  return result.status === 0;
}

function hasCommand(command: string): boolean {
  const result = spawnSync("which", [command], { stdio: "ignore" });
  return result.status === 0;
}

function resolvePdfEngine(): string | null {
  const preferredEngines = ["tectonic", "xelatex", "lualatex", "pdflatex", "wkhtmltopdf", "weasyprint", "prince", "typst"];
  for (const engine of preferredEngines) {
    if (hasCommand(engine)) {
      return engine;
    }
  }
  return null;
}

function getMissingPdfEngineReason(): string {
  return "No PDF engine found. Install one of: tectonic, xelatex, lualatex, pdflatex, wkhtmltopdf, weasyprint, prince, or typst.";
}

function resolveBundledFile(relativePathFromPackageRoot: string): string | undefined {
  let current = path.dirname(fileURLToPath(import.meta.url));
  while (true) {
    const candidate = path.join(current, relativePathFromPackageRoot);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

export function createPandocExporter(format: Exclude<ExportFormat, "md">): Exporter {
  return {
    id: format,
    description: `Export ${format.toUpperCase()} with pandoc`,
    canRun() {
      if (!hasPandoc()) {
        return {
          ok: false,
          reason: "pandoc is not installed. Install pandoc to enable docx/pdf/epub exports."
        };
      }

      if (format === "pdf" && !resolvePdfEngine()) {
        return {
          ok: false,
          reason: getMissingPdfEngineReason()
        };
      }

      return { ok: true };
    },
    run({ inputPath, outputPath, cwd, resourcePaths }) {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      const args = [inputPath, "-o", outputPath];
      const imageLayoutFilter = resolveBundledFile(path.join("filters", "image-layout.lua"));
      if (imageLayoutFilter) {
        args.push("--lua-filter", imageLayoutFilter);
      }
      const imageLayoutStylesheet = resolveBundledFile(path.join("filters", "image-layout.css"));
      if (format === "epub" && imageLayoutStylesheet) {
        args.push("--css", imageLayoutStylesheet);
      }
      if (resourcePaths && resourcePaths.length > 0) {
        args.push(`--resource-path=${resourcePaths.join(path.delimiter)}`);
      }
      if (format === "pdf") {
        const engine = resolvePdfEngine();
        if (!engine) {
          throw new Error(getMissingPdfEngineReason());
        }
        args.push(`--pdf-engine=${engine}`);
      }

      const result = spawnSync("pandoc", args, {
        encoding: "utf8",
        cwd: cwd || undefined
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

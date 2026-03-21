import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { Exporter } from "../domain/exporter.ts";
import { createLatexExporter, prepareLatexPandocRun, runPandoc } from "./latex-exporter.ts";

function hasCommand(command: string): boolean {
  const result = spawnSync("which", [command], { stdio: "ignore" });
  return result.status === 0;
}

function resolvePdfEngine(requireXelatex = false): string | null {
  const preferredEngines = requireXelatex
    ? ["xelatex"]
    : ["tectonic", "xelatex", "lualatex", "pdflatex", "wkhtmltopdf", "weasyprint", "prince", "typst"];
  for (const engine of preferredEngines) {
    if (hasCommand(engine)) {
      return engine;
    }
  }
  return null;
}

function getMissingPdfEngineReason(requireXelatex = false): string {
  if (requireXelatex) {
    return "PDF export with fontFamily requires xelatex. Install a XeLaTeX distribution such as MacTeX, TeX Live, or MiKTeX.";
  }
  return "No PDF engine found. Install one of: tectonic, xelatex, lualatex, pdflatex, wkhtmltopdf, weasyprint, prince, or typst.";
}

export function createPdfExporter(): Exporter {
  const latexExporter = createLatexExporter();
  return {
    id: "pdf",
    description: "Export PDF through the shared LaTeX pandoc path",
    canRun() {
      const capability = latexExporter.canRun();
      if (!capability.ok) {
        return capability;
      }
      return { ok: true };
    },
    async run(args) {
      fs.mkdirSync(path.dirname(args.outputPath), { recursive: true });
      const prepared = prepareLatexPandocRun(args);
      const engine = resolvePdfEngine(prepared.requireXelatex);
      if (!engine) {
        throw new Error(getMissingPdfEngineReason(prepared.requireXelatex));
      }
      runPandoc([...prepared.args, `--pdf-engine=${engine}`], args.cwd);
      return { outputPath: args.outputPath };
    }
  };
}

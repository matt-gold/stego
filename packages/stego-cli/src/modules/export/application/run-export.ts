import path from "node:path";
import { parseExportFormat, type Exporter } from "../domain/exporter.ts";
import { markdownExporter } from "../infra/markdown-exporter.ts";
import { createPandocExporter } from "../infra/pandoc-exporter.ts";
import type { ExportFormat, RunExportInput, RunExportResult } from "../types.ts";

const exporters: Record<ExportFormat, Exporter> = {
  md: markdownExporter,
  docx: createPandocExporter("docx"),
  pdf: createPandocExporter("pdf"),
  epub: createPandocExporter("epub")
};

export function runExport(input: RunExportInput): RunExportResult {
  const format = parseExportFormat(input.format.toLowerCase());
  const exporter = exporters[format];
  const targetPath = input.explicitOutputPath
    || path.join(input.project.distDir, "exports", `${input.project.id}.${format}`);
  const outputPath = path.resolve(input.project.workspace.repoRoot, targetPath);

  const capability = exporter.canRun();
  if (!capability.ok) {
    throw new Error(capability.reason || `Exporter '${exporter.id}' cannot run.`);
  }

  exporter.run({
    inputPath: input.inputPath,
    outputPath
  });

  return {
    outputPath,
    format
  };
}

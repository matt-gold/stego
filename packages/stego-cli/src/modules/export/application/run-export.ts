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

export async function runExport(input: RunExportInput): Promise<RunExportResult> {
  const format = parseExportFormat(input.format.toLowerCase());
  const exporter = exporters[format];
  const targetPath = input.explicitOutputPath
    || path.join(input.project.distDir, "exports", `${input.project.id}.${format}`);
  const outputPath = path.resolve(input.project.workspace.repoRoot, targetPath);

  const capability = exporter.canRun();
  if (!capability.ok) {
    throw new Error(capability.reason || `Exporter '${exporter.id}' cannot run.`);
  }

  const resourcePaths = input.resourcePaths
    ? uniqueResolvedPaths(input.resourcePaths)
    : uniqueResolvedPaths([
      input.project.root,
      input.project.manuscriptDir,
      path.join(input.project.root, "assets"),
      path.dirname(input.inputPath)
    ]);

  await exporter.run({
    inputPath: input.inputPath,
    outputPath,
    cwd: input.project.root,
    inputFormat: input.inputFormat,
    resourcePaths,
    requiredFilters: input.requiredFilters,
    extraArgs: input.extraArgs
  });

  return {
    outputPath,
    format
  };
}

function uniqueResolvedPaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of paths) {
    const normalized = path.resolve(value);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    unique.push(normalized);
  }
  return unique;
}

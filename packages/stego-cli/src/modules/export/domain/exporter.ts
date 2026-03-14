import type { ExportFormat } from "../types.ts";
import type { DocxExportPostprocess } from "../types.ts";

export interface ExportRunArgs {
  inputPath: string;
  outputPath: string;
  cwd?: string;
  inputFormat?: string;
  resourcePaths?: string[];
  requiredFilters?: string[];
  extraArgs?: string[];
  postprocess?: {
    docx?: DocxExportPostprocess;
  };
}

export interface ExportCapability {
  ok: boolean;
  reason?: string;
}

export interface ExportResult {
  outputPath: string;
}

export interface Exporter {
  id: ExportFormat;
  description: string;
  canRun: () => ExportCapability;
  run: (args: ExportRunArgs) => Promise<ExportResult> | ExportResult;
}

export function parseExportFormat(value: string): ExportFormat {
  if (value === "md" || value === "docx" || value === "pdf" || value === "epub") {
    return value;
  }
  throw new Error(`Unsupported export format '${value}'. Use md, docx, pdf, or epub.`);
}

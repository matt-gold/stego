import type { ExportFormat } from "../types.ts";

export interface ExportRunArgs {
  inputPath: string;
  outputPath: string;
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
  run: (args: ExportRunArgs) => ExportResult;
}

export function parseExportFormat(value: string): ExportFormat {
  if (value === "md" || value === "docx" || value === "pdf" || value === "epub") {
    return value;
  }
  throw new Error(`Unsupported export format '${value}'. Use md, docx, pdf, or epub.`);
}

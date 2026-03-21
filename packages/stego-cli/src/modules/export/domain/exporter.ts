import type { ExportFormat } from "../types.ts";
import type { DocxExportPostprocess, PdfExportPostprocess } from "../types.ts";
import { isExportTarget } from "@stego-labs/shared/domain/templates";

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
    pdf?: PdfExportPostprocess;
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
  if (isExportTarget(value)) {
    return value;
  }
  throw new Error(`Unsupported export format '${value}'. Use md, docx, pdf, epub, or latex.`);
}

export type ExportFormat = "md" | "docx" | "pdf" | "epub";

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
  id: string;
  description: string;
  canRun: () => ExportCapability;
  run: (args: ExportRunArgs) => ExportResult;
}

import type { ProjectContext } from "../project/index.ts";

export type ExportModuleName = "export";

export type ExportFormat = "md" | "docx" | "pdf" | "epub";

export type RunExportInput = {
  project: ProjectContext;
  format: string;
  inputPath: string;
  inputFormat?: string;
  explicitOutputPath?: string;
  resourcePaths?: string[];
  requiredFilters?: string[];
  extraArgs?: string[];
};

export type RunExportResult = {
  outputPath: string;
  format: ExportFormat;
};

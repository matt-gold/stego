import type { ProjectContext } from "../project/index.ts";
import type { DocxBlockLayoutSpec } from "@stego-labs/shared/domain/layout";

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
  postprocess?: {
    docx?: DocxExportPostprocess;
  };
};

export type RunExportResult = {
  outputPath: string;
  format: ExportFormat;
};

export type DocxExportPostprocess = {
  blockLayouts?: DocxBlockLayoutSpec[];
};

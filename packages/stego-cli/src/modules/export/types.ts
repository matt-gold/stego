import type { ProjectContext } from "../project/index.ts";
import type {
  DocxBlockLayoutSpec,
  DocxCharacterStyleSpec,
  DocxDocumentStyleSpec,
  DocxPageTemplateSpec,
} from "@stego-labs/shared/domain/layout";
import type { ExportTarget } from "@stego-labs/shared/domain/templates";

export type ExportModuleName = "export";

export type ExportFormat = ExportTarget;

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
    pdf?: PdfExportPostprocess;
  };
};

export type RunExportResult = {
  outputPath: string;
  format: ExportFormat;
};

export type DocxExportPostprocess = {
  blockLayouts?: DocxBlockLayoutSpec[];
  documentStyle?: DocxDocumentStyleSpec;
  characterStyles?: DocxCharacterStyleSpec[];
  pageTemplates?: DocxPageTemplateSpec[];
};

export type PdfExportPostprocess = {
  requiresXelatex?: boolean;
};

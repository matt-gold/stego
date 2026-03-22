import path from "node:path";
import { CliError } from "@stego-labs/shared/contracts/cli";
import {
  isExportTarget,
  isPresentationTarget,
  type ExportTarget,
  type PresentationTarget
} from "@stego-labs/shared/domain/templates";
import type { ProjectContext } from "../../project/index.ts";
import { prepareRenderedExport, runExport } from "../../export/index.ts";
import { buildTemplateProject } from "./build-template-project.ts";
import type { TemplateBuildArtifactPaths } from "./build-template-project.ts";

export type ExportTemplateProjectInput = {
  project: ProjectContext;
  templatePath?: string;
  format: string;
  explicitOutputPath?: string;
  artifactPaths?: TemplateBuildArtifactPaths;
};

export type ExportTemplateProjectResult = {
  outputPath: string;
  markdownPath: string;
  backendDocumentPath: string;
};

export async function exportTemplateProject(input: ExportTemplateProjectInput): Promise<ExportTemplateProjectResult> {
  const format = normalizeExportTarget(input.format);
  const built = await buildTemplateProject(input.project, input.templatePath, input.artifactPaths);
  assertDeclaredTargetsSupportFormat(input.templatePath, built.declaredTargets, format);
  const presentationFormat = format === "md" ? null : format;
  const prepared = presentationFormat === null
    ? null
    : prepareRenderedExport({
      format: presentationFormat,
      backendDocument: built.backendDocument,
      project: input.project,
      markdownPath: built.markdownPath,
    });

  try {
    const exported = await runExport({
      project: input.project,
      format,
      inputPath: built.markdownPath,
      inputFormat: prepared?.inputFormat,
      resourcePaths: prepared?.resourcePaths,
      requiredFilters: prepared?.requiredFilters,
      explicitOutputPath: input.explicitOutputPath,
      extraArgs: prepared?.extraArgs,
      postprocess: prepared?.postprocess
    });

    return {
      outputPath: exported.outputPath,
      markdownPath: built.markdownPath,
      backendDocumentPath: built.backendDocumentPath
    };
  } finally {
    prepared?.cleanup();
  }
}

function normalizeExportTarget(value: string): ExportTarget {
  const normalized = value.trim().toLowerCase();
  if (!isExportTarget(normalized)) {
    throw new CliError("INVALID_USAGE", `Unsupported export format '${value}'. Use md, docx, pdf, epub, or latex.`);
  }
  return normalized;
}

function assertDeclaredTargetsSupportFormat(
  templatePath: string | undefined,
  declaredTargets: readonly PresentationTarget[] | null,
  format: ExportTarget
): void {
  if (!declaredTargets || !isPresentationTarget(format) || declaredTargets.includes(format)) {
    return;
  }

  const renderedPath = templatePath ?? "templates/book.template.tsx";
  throw new CliError(
    "INVALID_USAGE",
    `Template '${renderedPath}' declares ${declaredTargets.join(", ")} and cannot be exported as '${format}'. Use a compatible format or choose a different template.`
  );
}

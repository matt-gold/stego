import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import { CliError } from "@stego-labs/shared/contracts/cli";
import {
  isExportTarget,
  isPresentationTarget,
  type ExportTarget,
  type PresentationTarget
} from "@stego-labs/shared/domain/templates";
import type { ProjectContext } from "../../project/index.ts";
import { runExport } from "../../export/index.ts";
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
  renderPlanPath: string;
};

export async function exportTemplateProject(input: ExportTemplateProjectInput): Promise<ExportTemplateProjectResult> {
  const format = normalizeExportTarget(input.format);
  const built = await buildTemplateProject(input.project, input.templatePath, input.artifactPaths);
  assertDeclaredTargetsSupportFormat(input.templatePath, built.declaredTargets, format);
  const metadataFilePath = Object.keys(built.renderPlan.metadata).length > 0
    ? writeTempMetadataFile(built.renderPlan.metadata)
    : null;

  try {
    const exported = await runExport({
      project: input.project,
      format,
      inputPath: built.markdownPath,
      inputFormat: built.renderPlan.inputFormat,
      resourcePaths: [
        ...built.renderPlan.resourcePaths,
        input.project.contentDir,
        path.dirname(built.markdownPath)
      ],
      requiredFilters: built.renderPlan.requiredFilters,
      explicitOutputPath: input.explicitOutputPath,
      extraArgs: metadataFilePath ? ["--metadata-file", metadataFilePath] : [],
      postprocess: built.renderPlan.postprocess
    });

    return {
      outputPath: exported.outputPath,
      markdownPath: built.markdownPath,
      renderPlanPath: built.renderPlanPath
    };
  } finally {
    if (metadataFilePath) {
      fs.rmSync(path.dirname(metadataFilePath), { recursive: true, force: true });
    }
  }
}

function writeTempMetadataFile(metadata: Record<string, unknown>): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stego-template-export-"));
  const metadataFilePath = path.join(tempDir, "metadata.yaml");
  fs.writeFileSync(metadataFilePath, yaml.dump(metadata), "utf8");
  return metadataFilePath;
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

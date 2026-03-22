import path from "node:path";
import type { PandocPresentationBackendDocument } from "@stego-labs/engine";
import type { ExportTarget } from "@stego-labs/shared/domain/templates";
import type { ProjectContext } from "../../project/index.ts";
import { prepareDocxTarget } from "../infra/pandoc-presentation/prepare-docx-target.ts";
import { prepareEpubTarget } from "../infra/pandoc-presentation/prepare-epub-target.ts";
import { prepareLatexTarget } from "../infra/pandoc-presentation/prepare-latex-target.ts";
import { preparePdfTarget } from "../infra/pandoc-presentation/prepare-pdf-target.ts";
import type { PreparedRenderedExport } from "../infra/pandoc-presentation/types.ts";

export type PrepareRenderedExportInput = {
  format: ExportTarget;
  backendDocument: PandocPresentationBackendDocument;
  project: ProjectContext;
  markdownPath: string;
};

export function prepareRenderedExport(
  input: PrepareRenderedExportInput,
): PreparedRenderedExport {
  const prepared = prepareTargetExport(input.format, input.backendDocument);
  return {
    ...prepared,
    resourcePaths: [
      ...(prepared.resourcePaths || []),
      input.project.contentDir,
      path.dirname(input.markdownPath),
    ],
  };
}

function prepareTargetExport(
  format: ExportTarget,
  backendDocument: PandocPresentationBackendDocument,
): PreparedRenderedExport {
  switch (format) {
    case "docx":
      return prepareDocxTarget(backendDocument);
    case "latex":
      return prepareLatexTarget(backendDocument);
    case "pdf":
      return preparePdfTarget(backendDocument);
    case "epub":
      return prepareEpubTarget(backendDocument);
    case "md":
      throw new Error("Markdown export does not use presentation backend preparation.");
  }
}

import path from "node:path";
import { CliError } from "@stego-labs/shared/contracts/cli";
import type { RenderDocumentResult } from "@stego-labs/engine";
import type { PresentationTarget } from "@stego-labs/shared/domain/templates";
import type { ProjectContext } from "../../project/index.ts";
import { getPresentationExportAdapter } from "./get-presentation-export-adapter.ts";
import type { PreparedRenderedExport } from "../infra/pandoc-presentation/types.ts";

export type PrepareRenderedExportInput = {
  format: PresentationTarget;
  backendDocument: RenderDocumentResult;
  project: ProjectContext;
  markdownPath: string;
};

export function prepareRenderedExport(
  input: PrepareRenderedExportInput,
): PreparedRenderedExport {
  if ((input.format as string) === "md") {
    throw new CliError("INTERNAL_ERROR", "Markdown export does not use presentation backend preparation.");
  }

  const adapter = getPresentationExportAdapter(input.backendDocument.backend);
  const prepared = adapter.prepareExport({
    format: input.format,
    backendDocument: input.backendDocument,
    project: input.project,
    markdownPath: input.markdownPath,
  });

  return {
    ...prepared,
    resourcePaths: [
      ...(prepared.resourcePaths || []),
      input.project.contentDir,
      path.dirname(input.markdownPath),
    ],
  };
}

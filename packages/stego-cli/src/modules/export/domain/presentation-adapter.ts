import type { RenderDocumentResult } from "@stego-labs/engine";
import type { PresentationTarget } from "@stego-labs/shared/domain/templates";
import type { ProjectContext } from "../../project/index.ts";
import type { PreparedRenderedExport } from "../infra/pandoc-presentation/types.ts";

export type PresentationAdapterPrepareInput = {
  format: PresentationTarget;
  backendDocument: RenderDocumentResult;
  project: ProjectContext;
  markdownPath: string;
};

export interface PresentationExportAdapter {
  backend: RenderDocumentResult["backend"];
  prepareExport: (input: PresentationAdapterPrepareInput) => PreparedRenderedExport;
}

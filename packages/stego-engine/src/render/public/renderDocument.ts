import { lowerToPandocPresentationBackendDocument } from "../internal/backends/pandoc-presentation/index.ts";
import { expandOpaqueContentNodes } from "../internal/normalize/index.ts";
import type { RenderDocumentInput, RenderDocumentResult } from "./types.ts";

export function renderDocument(input: RenderDocumentInput): RenderDocumentResult {
  return lowerToPandocPresentationBackendDocument(
    expandOpaqueContentNodes(input.document, input.context),
    input.projectRoot,
    input.context,
  );
}

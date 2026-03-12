import { lowerToPandocRenderPlan } from "../internal/backends/pandoc/index.ts";
import type { RenderDocumentInput, RenderDocumentResult } from "./types.ts";

export function renderDocument(input: RenderDocumentInput): RenderDocumentResult {
  return lowerToPandocRenderPlan(input.document, input.projectRoot);
}

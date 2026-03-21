import { lowerToLatexRenderPlan } from "../internal/backends/latex/index.ts";
import { expandOpaqueContentNodes } from "../internal/normalize/index.ts";
import type { RenderDocumentInput, RenderDocumentResult } from "./types.ts";

export function renderDocument(input: RenderDocumentInput): RenderDocumentResult {
  return lowerToLatexRenderPlan(
    expandOpaqueContentNodes(input.document, input.context),
    input.projectRoot,
    input.context,
  );
}

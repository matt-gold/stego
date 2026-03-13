import path from "node:path";
import type { StegoDocumentNode } from "../../../../ir/index.ts";
import type { RenderDocumentResult } from "../../../public/types.ts";
import { normalizePageLayout } from "../../normalize/index.ts";
import { buildPandocMetadata } from "./metadata-writer.ts";
import { writePandocMarkdown } from "./markdown-writer.ts";

export function lowerToPandocRenderPlan(document: StegoDocumentNode, projectRoot: string): RenderDocumentResult {
  const layout = normalizePageLayout(document);
  return {
    backend: "pandoc",
    inputFormat: "markdown-implicit_figures",
    markdown: writePandocMarkdown(document.children),
    metadata: buildPandocMetadata(layout),
    resourcePaths: [projectRoot, path.join(projectRoot, "assets")],
    requiredFilters: ["image-layout", "block-layout"]
  };
}

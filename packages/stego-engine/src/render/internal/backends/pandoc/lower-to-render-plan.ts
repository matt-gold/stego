import path from "node:path";
import type { StegoDocumentNode } from "../../../../ir/index.ts";
import type { TemplateContext } from "../../../../template/index.ts";
import type { RenderDocumentResult } from "../../../public/types.ts";
import { normalizePageLayout } from "../../normalize/index.ts";
import { buildPandocMetadata } from "./metadata-writer.ts";
import { writePandocMarkdown } from "./markdown-writer.ts";

export function lowerToPandocRenderPlan(
  document: StegoDocumentNode,
  projectRoot: string,
  context: TemplateContext
): RenderDocumentResult {
  const layout = normalizePageLayout(document);
  const markdown = writePandocMarkdown(document.children, context.content);
  return {
    backend: "pandoc",
    inputFormat: "markdown-implicit_figures",
    markdown: markdown.markdown,
    metadata: buildPandocMetadata(layout),
    resourcePaths: [projectRoot, path.join(projectRoot, "assets")],
    requiredFilters: ["image-layout", "block-layout"],
    postprocess: {
      docx: {
        blockLayouts: markdown.docxBlockLayouts
      }
    }
  };
}

import path from "node:path";
import type { StegoDocumentNode } from "../../../../ir/index.ts";
import type { TemplateContext } from "../../../../template/index.ts";
import type { RenderDocumentResult } from "../../../public/types.ts";
import { formatSpacingValue, normalizePageLayout } from "../../normalize/index.ts";
import { buildLatexMetadata } from "./metadata-writer.ts";
import { writePandocMarkdown } from "../pandoc/markdown-writer.ts";

export function lowerToLatexRenderPlan(
  document: StegoDocumentNode,
  projectRoot: string,
  context: TemplateContext
): RenderDocumentResult {
  const layout = normalizePageLayout(document);
  const markdown = writePandocMarkdown(document.children, context.allLeaves, {
    parSpaceBefore: layout.parSpaceBefore,
    parSpaceAfter: layout.parSpaceAfter,
  });
  const documentStyle = {
    fontFamily: typeof layout.fontFamily === "string" && layout.fontFamily.trim().length > 0 ? layout.fontFamily.trim() : undefined,
    fontSizePt: toFontSizePoints(layout.fontSize),
    lineSpacing: layout.lineSpacing,
    parSpaceBefore: formatSpacingValue(layout.parSpaceBefore),
    parSpaceAfter: formatSpacingValue(layout.parSpaceAfter)
  };
  return {
    backend: "pandoc-latex",
    inputFormat: "markdown-implicit_figures",
    markdown: markdown.markdown,
    metadata: buildLatexMetadata(layout, {
      usesBlockFontFamily: markdown.usesBlockFontFamily,
      usesBlockLineSpacing: markdown.usesBlockLineSpacing
    }),
    resourcePaths: [projectRoot, path.join(projectRoot, "assets")],
    requiredFilters: ["image-layout", "block-layout"],
    postprocess: {
      docx: {
        blockLayouts: markdown.docxBlockLayouts,
        documentStyle
      },
      pdf: {
        requiresXelatex: Boolean(documentStyle?.fontFamily || markdown.usesBlockFontFamily)
      }
    }
  };
}

function toFontSizePoints(value: number | `${number}pt` | undefined): number | undefined {
  if (value == null) {
    return undefined;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)pt$/);
  if (!match) {
    return undefined;
  }
  const amount = Number(match[1]);
  return Number.isFinite(amount) ? amount : undefined;
}

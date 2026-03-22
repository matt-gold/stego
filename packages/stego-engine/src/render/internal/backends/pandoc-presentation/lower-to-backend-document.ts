import path from "node:path";
import type { StegoDocumentNode } from "../../../../ir/index.ts";
import type { TemplateContext } from "../../../../template/index.ts";
import type {
  PresentationPageLayout,
  RenderDocumentResult,
} from "../../../public/types.ts";
import { formatSpacingValue, normalizePageLayout } from "../../normalize/index.ts";
import { writePandocMarkdown } from "./markdown-writer.ts";

export function lowerToPandocPresentationBackendDocument(
  document: StegoDocumentNode,
  projectRoot: string,
  context: TemplateContext,
): RenderDocumentResult {
  const layout = normalizePageLayout(document);
  const written = writePandocMarkdown(document.children, context.allLeaves, {
    spaceBefore: layout.spaceBefore,
    spaceAfter: layout.spaceAfter,
  });

  return {
    backend: "pandoc-presentation",
    source: {
      inputFormat: "markdown-implicit_figures",
      markdown: written.markdown,
      resourcePaths: [projectRoot, path.join(projectRoot, "assets")],
      requiredFilters: ["image-layout", "block-layout"],
    },
    presentation: {
      page: buildPresentationPageLayout(layout),
      blockMarkers: written.blockMarkers,
      features: {
        usesBlockFontFamily: written.usesBlockFontFamily,
        usesBlockLineSpacing: written.usesBlockLineSpacing,
        usesUnderline: written.usesUnderline,
        usesTextColor: written.usesTextColor,
        requiresNamedFontEngine: Boolean(layout.fontFamily || written.usesBlockFontFamily),
      },
    },
  };
}

function buildPresentationPageLayout(
  layout: ReturnType<typeof normalizePageLayout>,
): PresentationPageLayout {
  return {
    geometry: layout.geometry,
    fontFamily: typeof layout.fontFamily === "string" && layout.fontFamily.trim().length > 0
      ? layout.fontFamily.trim()
      : undefined,
    fontSize: layout.fontSize,
    lineSpacing: layout.lineSpacing,
    spaceBefore: formatSpacingValue(layout.spaceBefore),
    spaceAfter: formatSpacingValue(layout.spaceAfter),
    header: layout.header,
    footer: layout.footer,
  };
}

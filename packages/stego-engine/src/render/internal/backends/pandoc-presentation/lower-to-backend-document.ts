import path from "node:path";
import type {
  StegoDocumentNode,
} from "../../../../ir/index.ts";
import type { TemplateContext } from "../../../../template/index.ts";
import type {
  PresentationPageLayout,
  PresentationPageTemplateSegment,
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
  const page = buildPresentationPageLayout(layout);
  const written = writePandocMarkdown(document.children, context.allLeaves, {
    spaceBefore: layout.spaceBefore,
    spaceAfter: layout.spaceAfter,
  });

  return {
    backend: "pandoc-presentation",
    source: {
      inputFormat: "markdown+bracketed_spans-implicit_figures",
      markdown: written.markdown,
      resourcePaths: [projectRoot, path.join(projectRoot, "assets")],
      requiredFilters: ["image-layout", "block-layout"],
    },
    presentation: {
      page,
      pageTemplates: written.pageTemplates,
      blockMarkers: written.blockMarkers,
      inlineStyles: written.inlineStyles,
      features: {
        usesBlockFontFamily: written.usesBlockFontFamily || pageTemplatesUseProperty(written.pageTemplates, "fontFamily"),
        usesBlockLineSpacing: written.usesBlockLineSpacing,
        usesUnderline: written.usesUnderline || pageTemplatesUseProperty(written.pageTemplates, "underline"),
        usesTextColor: written.usesTextColor || pageTemplatesUseProperty(written.pageTemplates, "color"),
        requiresNamedFontEngine: Boolean(
          page.fontFamily
          || written.usesBlockFontFamily
          || pageTemplatesUseProperty(written.pageTemplates, "fontFamily"),
        ),
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
  };
}

function pageTemplatesUseProperty(
  segments: PresentationPageTemplateSegment[],
  property: "fontFamily" | "underline" | "color",
): boolean {
  return segments.some((segment) =>
    regionUses(segment.header, property) || regionUses(segment.footer, property)
  );
}

function regionUses(
  region: PresentationPageTemplateSegment["header"],
  property: "fontFamily" | "underline" | "color",
): boolean {
  if (!region) {
    return false;
  }
  for (const nodes of [region.left, region.center, region.right]) {
    if (nodes && nodes.some((node) => nodeUses(node, property))) {
      return true;
    }
  }
  return false;
}

function nodeUses(
  node: NonNullable<NonNullable<PresentationPageTemplateSegment["header"]>["left"]>[number],
  property: "fontFamily" | "underline" | "color",
): boolean {
  return node.kind === "span"
    ? Boolean(node[property]) || node.children.some((child) => nodeUses(child, property))
    : false;
}

import path from "node:path";
import type {
  FontFamilyValue,
  FontSizeValue,
  FontWeightValue,
  PageRegionSpec,
  StegoDocumentNode,
  StegoPageRegionInlineNode,
  StegoSpanNode,
} from "../../../../ir/index.ts";
import type { TemplateContext } from "../../../../template/index.ts";
import type {
  PresentationPageRegion,
  PresentationPageRegionNode,
  PresentationPageLayout,
  RenderDocumentResult,
} from "../../../public/types.ts";
import { normalizeHexColor } from "../../../../style/index.ts";
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
      blockMarkers: written.blockMarkers,
      inlineStyles: written.inlineStyles,
      features: {
        usesBlockFontFamily: written.usesBlockFontFamily || regionUsesFontFamily(page.header) || regionUsesFontFamily(page.footer),
        usesBlockLineSpacing: written.usesBlockLineSpacing,
        usesUnderline: written.usesUnderline || regionUsesUnderline(page.header) || regionUsesUnderline(page.footer),
        usesTextColor: written.usesTextColor || regionUsesColor(page.header) || regionUsesColor(page.footer),
        requiresNamedFontEngine: Boolean(
          page.fontFamily
          || written.usesBlockFontFamily
          || regionUsesFontFamily(page.header)
          || regionUsesFontFamily(page.footer),
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
    header: lowerPageRegion(layout.header),
    footer: lowerPageRegion(layout.footer),
  };
}

function lowerPageRegion(region: PageRegionSpec | undefined): PresentationPageRegion | undefined {
  if (!region) {
    return undefined;
  }

  const lowered: PresentationPageRegion = {
    left: lowerPageRegionNodes(region.left),
    center: lowerPageRegionNodes(region.center),
    right: lowerPageRegionNodes(region.right),
  };

  return lowered.left || lowered.center || lowered.right ? lowered : undefined;
}

function lowerPageRegionNodes(
  nodes: StegoPageRegionInlineNode[] | undefined,
): PresentationPageRegionNode[] | undefined {
  if (!nodes || nodes.length === 0) {
    return undefined;
  }

  return nodes.map((node) => {
    if (node.kind === "text") {
      return { kind: "text", value: node.value };
    }
    if (node.kind === "pageNumber") {
      return { kind: "pageNumber" };
    }
    return {
      kind: "span",
      fontFamily: formatFontFamilyValue(node.fontFamily),
      fontSizePt: formatFontSizeInPoints(node.fontSize),
      fontWeight: node.fontWeight,
      italic: node.italic,
      underline: node.underline,
      smallCaps: node.smallCaps,
      color: normalizeHexColor(node.color),
      children: lowerPageRegionSpanChildren(node.children),
    };
  });
}

function lowerPageRegionSpanChildren(
  nodes: StegoSpanNode["children"],
): PresentationPageRegionNode[] {
  const children: PresentationPageRegionNode[] = [];
  for (const node of nodes) {
    if (node.kind === "text") {
      children.push({ kind: "text", value: node.value });
      continue;
    }
    if (node.kind === "link") {
      throw new Error("<Stego.Link /> is not supported inside <Stego.PageTemplate /> regions in V1.");
    }
    children.push({
      kind: "span",
      fontFamily: formatFontFamilyValue(node.fontFamily),
      fontSizePt: formatFontSizeInPoints(node.fontSize),
      fontWeight: node.fontWeight,
      italic: node.italic,
      underline: node.underline,
      smallCaps: node.smallCaps,
      color: normalizeHexColor(node.color),
      children: lowerPageRegionSpanChildren(node.children),
    });
  }
  return children;
}

function regionUsesFontFamily(region: PresentationPageRegion | undefined): boolean {
  if (!region) {
    return false;
  }
  for (const nodes of [region.left, region.center, region.right]) {
    if (nodes && nodes.some((node) => nodeUses(node, "fontFamily"))) {
      return true;
    }
  }
  return false;
}

function regionUsesUnderline(region: PresentationPageRegion | undefined): boolean {
  return regionUses(region, "underline");
}

function regionUsesColor(region: PresentationPageRegion | undefined): boolean {
  return regionUses(region, "color");
}

function regionUses(
  region: PresentationPageRegion | undefined,
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
  node: PresentationPageRegionNode,
  property: "fontFamily" | "underline" | "color",
): boolean {
  return node.kind === "span"
    ? Boolean(node[property]) || node.children.some((child) => nodeUses(child, property))
    : false;
}

function formatFontFamilyValue(value: FontFamilyValue | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function formatFontSizeInPoints(value: FontSizeValue | undefined): number | undefined {
  if (value == null) {
    return undefined;
  }
  const normalized = typeof value === "number" ? `${value}pt` : value.trim();
  const match = normalized.match(/^(-?\d+(?:\.\d+)?)pt$/);
  if (!match) {
    return undefined;
  }
  const amount = Number(match[1]);
  return Number.isFinite(amount) ? amount : undefined;
}

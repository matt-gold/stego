import type {
  PandocPresentationBackendDocument,
  PresentationBlockMarker,
  PresentationInlineStyleSpec,
  PresentationPageRegion,
  PresentationPageRegionNode,
} from "@stego-labs/engine";
import type {
  DocxBlockLayoutSpec,
  DocxCharacterStyleSpec,
  DocxDocumentStyleSpec,
  DocxPageRegion,
  DocxPageRegionNode,
  DocxPageTemplateSpec,
} from "@stego-labs/shared/domain/layout";
import type { PreparedRenderedExport } from "./types.ts";

export function prepareDocxTarget(
  backendDocument: PandocPresentationBackendDocument,
): PreparedRenderedExport {
  return {
    inputFormat: backendDocument.source.inputFormat,
    resourcePaths: backendDocument.source.resourcePaths,
    requiredFilters: backendDocument.source.requiredFilters,
    postprocess: {
      docx: {
        blockLayouts: backendDocument.presentation.blockMarkers.map(toDocxBlockLayoutSpec),
        documentStyle: toDocxDocumentStyleSpec(backendDocument),
        characterStyles: backendDocument.presentation.inlineStyles.map(toDocxCharacterStyleSpec),
        pageTemplate: toDocxPageTemplateSpec(backendDocument),
      },
    },
    cleanup: () => {},
  };
}

function toDocxDocumentStyleSpec(
  backendDocument: PandocPresentationBackendDocument,
): DocxDocumentStyleSpec | undefined {
  const page = backendDocument.presentation.page;
  const style: DocxDocumentStyleSpec = {
    fontFamily: page.fontFamily,
    fontSizePt: toFontSizePoints(page.fontSize),
    lineSpacing: page.lineSpacing,
    spaceBefore: page.spaceBefore,
    spaceAfter: page.spaceAfter,
  };

  return style.fontFamily
    || style.fontSizePt !== undefined
    || style.lineSpacing !== undefined
    || style.spaceBefore !== undefined
    || style.spaceAfter !== undefined
    ? style
    : undefined;
}

function toDocxPageTemplateSpec(
  backendDocument: PandocPresentationBackendDocument,
): DocxPageTemplateSpec | undefined {
  const page = backendDocument.presentation.page;
  if (!page.header && !page.footer) {
    return undefined;
  }

  return {
    header: toDocxPageRegion(page.header),
    footer: toDocxPageRegion(page.footer),
    defaultFontFamily: page.fontFamily,
    defaultFontSizePt: toFontSizePoints(page.fontSize),
    defaultLineSpacing: page.lineSpacing,
  };
}

function toDocxBlockLayoutSpec(marker: PresentationBlockMarker): DocxBlockLayoutSpec {
  return {
    bookmarkName: marker.markerId,
    pageBreak: marker.pageBreak,
    spaceBefore: marker.spaceBefore,
    spaceAfter: marker.spaceAfter,
    insetLeft: marker.insetLeft,
    insetRight: marker.insetRight,
    firstLineIndent: marker.firstLineIndent,
    align: marker.align,
    fontFamily: marker.fontFamily,
    fontSizePt: marker.fontSizePt,
    lineSpacing: marker.lineSpacing,
    fontWeight: marker.fontWeight,
    italic: marker.italic,
    underline: marker.underline,
    smallCaps: marker.smallCaps,
    color: toDocxColor(marker.color),
    keepTogether: marker.keepTogether,
    spacerLines: marker.spacerLines,
  };
}

function toDocxCharacterStyleSpec(style: PresentationInlineStyleSpec): DocxCharacterStyleSpec {
  return {
    styleId: style.styleId,
    fontFamily: style.fontFamily,
    fontSizePt: style.fontSizePt,
    fontWeight: style.fontWeight,
    italic: style.italic,
    underline: style.underline,
    smallCaps: style.smallCaps,
    color: toDocxColor(style.color),
  };
}

function toDocxPageRegion(region: PresentationPageRegion | undefined): DocxPageRegion | undefined {
  if (!region) {
    return undefined;
  }
  return {
    left: toDocxPageRegionNodes(region.left),
    center: toDocxPageRegionNodes(region.center),
    right: toDocxPageRegionNodes(region.right),
  };
}

function toDocxPageRegionNodes(nodes: PresentationPageRegionNode[] | undefined): DocxPageRegionNode[] | undefined {
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
      fontFamily: node.fontFamily,
      fontSizePt: node.fontSizePt,
      fontWeight: node.fontWeight,
      italic: node.italic,
      underline: node.underline,
      smallCaps: node.smallCaps,
      color: toDocxColor(node.color),
      children: toDocxPageRegionNodes(node.children) || [],
    };
  });
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

function toDocxColor(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return /^#[0-9A-Fa-f]{6}$/.test(trimmed) ? trimmed.slice(1).toUpperCase() : undefined;
}

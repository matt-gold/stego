import type {
  PandocPresentationBackendDocument,
  PresentationBlockMarker,
} from "@stego-labs/engine";
import type { DocxBlockLayoutSpec, DocxDocumentStyleSpec } from "@stego-labs/shared/domain/layout";
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

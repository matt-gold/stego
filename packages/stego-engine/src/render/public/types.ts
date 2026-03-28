import type { StegoDocumentNode } from "../../ir/index.ts";
import type { TemplateContext } from "../../template/index.ts";

export type RenderDocumentInput = {
  document: StegoDocumentNode;
  projectRoot: string;
  context: TemplateContext;
};

export type PresentationBlockAlign = "left" | "center" | "right";

export type PresentationPageLayout = {
  geometry: string[];
  fontFamily?: string;
  fontSize?: number | `${number}pt`;
  lineSpacing?: number;
  spaceBefore?: string;
  spaceAfter?: string;
  header?: PresentationPageRegion;
  footer?: PresentationPageRegion;
};

export type PresentationInlineStyleSpec = {
  styleId: string;
  fontFamily?: string;
  fontSizePt?: number;
  fontWeight?: "normal" | "bold";
  italic?: boolean;
  underline?: boolean;
  smallCaps?: boolean;
  color?: string;
};

export type PresentationPageRegionNode =
  | { kind: "text"; value: string }
  | {
      kind: "span";
      fontFamily?: string;
      fontSizePt?: number;
      fontWeight?: "normal" | "bold";
      italic?: boolean;
      underline?: boolean;
      smallCaps?: boolean;
      color?: string;
      children: PresentationPageRegionNode[];
    }
  | { kind: "pageNumber" };

export type PresentationPageRegion = {
  left?: PresentationPageRegionNode[];
  center?: PresentationPageRegionNode[];
  right?: PresentationPageRegionNode[];
};

export type PresentationBlockMarker = {
  markerId: string;
  pageBreak?: boolean;
  spaceBefore?: string;
  spaceAfter?: string;
  insetLeft?: string;
  insetRight?: string;
  firstLineIndent?: string;
  align?: PresentationBlockAlign;
  fontFamily?: string;
  fontSizePt?: number;
  lineSpacing?: number;
  fontWeight?: "normal" | "bold";
  italic?: boolean;
  underline?: boolean;
  smallCaps?: boolean;
  color?: string;
  keepTogether?: boolean;
  spacerLines?: number;
};

export type PresentationFeatureUsage = {
  usesBlockFontFamily: boolean;
  usesBlockLineSpacing: boolean;
  usesUnderline: boolean;
  usesTextColor: boolean;
  requiresNamedFontEngine: boolean;
};

export type PandocPresentationBackendDocument = {
  backend: "pandoc-presentation";
  source: {
    inputFormat: string;
    markdown: string;
    resourcePaths: string[];
    requiredFilters: string[];
  };
  presentation: {
    page: PresentationPageLayout;
    blockMarkers: PresentationBlockMarker[];
    inlineStyles: PresentationInlineStyleSpec[];
    features: PresentationFeatureUsage;
  };
};

export type RenderDocumentResult = PandocPresentationBackendDocument;

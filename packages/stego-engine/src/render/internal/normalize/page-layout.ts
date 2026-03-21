import type {
  BodyStyle,
  FontFamilyValue,
  FontSizeValue,
  HeadingStyle,
  HeadingStyleMap,
  LineSpacingValue,
  PageRegionSpec,
  PageSizeValue,
  SpacingValue,
  StegoDocumentNode,
  StegoPageTemplateNode
} from "../../../ir/index.ts";
import { formatSpacingValue } from "./spacing.ts";

export type NormalizedPageLayout = {
  geometry: string[];
  footer?: PageRegionSpec;
  header?: PageRegionSpec;
  fontFamily?: FontFamilyValue;
  fontSize?: FontSizeValue;
  lineSpacing?: LineSpacingValue;
  spaceBefore: SpacingValue | 0;
  spaceAfter: SpacingValue | 0;
  bodyStyle?: BodyStyle;
  headingStyle?: HeadingStyle;
  headingStyles?: HeadingStyleMap;
};

export function normalizePageLayout(document: StegoDocumentNode): NormalizedPageLayout {
  const pageTemplate = document.children.find((node): node is StegoPageTemplateNode => node.kind === "pageTemplate");
  const geometry = [];
  const size = document.page?.size;
  const margin = formatSpacingValue(document.page?.margin);

  if (size) {
    geometry.push(...toGeometryForSize(size));
  }
  if (margin) {
    geometry.push(`margin=${margin}`);
  }

  return {
    geometry,
    header: pageTemplate?.header,
    footer: pageTemplate?.footer,
    fontFamily: document.bodyStyle?.fontFamily,
    fontSize: document.bodyStyle?.fontSize,
    lineSpacing: document.bodyStyle?.lineSpacing,
    spaceBefore: document.bodyStyle?.spaceBefore ?? 0,
    spaceAfter: document.bodyStyle?.spaceAfter ?? 0,
    bodyStyle: document.bodyStyle,
    headingStyle: document.headingStyle,
    headingStyles: document.headingStyles
  };
}

function toGeometryForSize(size: PageSizeValue): string[] {
  if (size === "5x8") {
    return ["paperwidth=5in", "paperheight=8in"];
  }
  if (size === "6x9") {
    return ["paperwidth=6in", "paperheight=9in"];
  }
  if (size === "letter") {
    return ["paper=letterpaper"];
  }
  return ["paper=a5paper"];
}

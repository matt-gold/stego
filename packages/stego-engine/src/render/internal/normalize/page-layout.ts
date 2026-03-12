import type { PageRegionSpec, PageSizeValue, StegoDocumentNode, StegoPageTemplateNode } from "../../../ir/index.ts";
import { formatSpacingValue } from "./spacing.ts";

export type NormalizedPageLayout = {
  geometry: string[];
  footer?: PageRegionSpec;
  header?: PageRegionSpec;
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
    footer: pageTemplate?.footer
  };
}

function toGeometryForSize(size: PageSizeValue): string[] {
  if (size === "5x8") {
    return ["paperwidth=5in", "paperheight=8in"];
  }
  if (size === "6x9") {
    return ["paperwidth=6in", "paperheight=9in"];
  }
  return ["paper=a5paper"];
}

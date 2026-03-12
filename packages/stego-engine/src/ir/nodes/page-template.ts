import type { PageRegionSpec, StegoPageTemplateNode } from "../types.ts";

export function createPageTemplateNode(
  header: PageRegionSpec | undefined,
  footer: PageRegionSpec | undefined
): StegoPageTemplateNode {
  return {
    kind: "pageTemplate",
    header,
    footer
  };
}

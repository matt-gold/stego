import type { PageRegionSpec, StegoPageTemplateNode } from "../types.ts";

export function createPageTemplateNode(
  header: PageRegionSpec | undefined,
  footer: PageRegionSpec | undefined,
  children: StegoPageTemplateNode["children"],
): StegoPageTemplateNode {
  return {
    kind: "pageTemplate",
    header,
    footer,
    children,
  };
}

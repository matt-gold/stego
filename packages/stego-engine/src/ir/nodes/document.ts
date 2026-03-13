import type { PageSpec, StegoDocumentNode, StegoNode } from "../types.ts";

export function createDocumentNode(page: PageSpec | undefined, children: StegoNode[]): StegoDocumentNode {
  return {
    kind: "document",
    page,
    children
  };
}

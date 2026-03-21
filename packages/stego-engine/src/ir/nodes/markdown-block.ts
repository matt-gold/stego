import type { StegoMarkdownBlockNode } from "../types.ts";

export function createMarkdownBlockNode(source: string): StegoMarkdownBlockNode {
  return {
    kind: "markdownBlock",
    source
  };
}

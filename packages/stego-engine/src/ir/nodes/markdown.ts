import type { StegoMarkdownNode } from "../types.ts";

export function createMarkdownNode(source: string): StegoMarkdownNode {
  return {
    kind: "markdown",
    source
  };
}

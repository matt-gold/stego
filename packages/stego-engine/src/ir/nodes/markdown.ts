import type { StegoMarkdownNode } from "../types.ts";

export function createMarkdownNode(props: {
  source?: string;
  leaf?: {
    id: string;
    body: string;
  };
}): StegoMarkdownNode {
  return {
    kind: "markdown",
    source: props.source,
    leaf: props.leaf
  };
}

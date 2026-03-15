import type { StegoPlainTextNode } from "../types.ts";

export function createPlainTextNode(props: {
  source?: string;
  leaf?: {
    id: string;
    body: string;
  };
}): StegoPlainTextNode {
  return {
    kind: "plainText",
    source: props.source,
    leaf: props.leaf
  };
}

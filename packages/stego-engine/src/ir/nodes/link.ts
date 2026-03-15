import type { StegoInlineNode, StegoLinkNode } from "../types.ts";

export function createLinkNode(
  leaf: string,
  props: {
    heading?: string;
    anchor?: string;
  },
  children: StegoInlineNode[]
): StegoLinkNode {
  return {
    kind: "link",
    leaf,
    heading: props.heading,
    anchor: props.anchor,
    children
  };
}

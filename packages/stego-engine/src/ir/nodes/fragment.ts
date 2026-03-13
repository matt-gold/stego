import type { StegoFragmentNode, StegoNode } from "../types.ts";

export function createFragmentNode(children: StegoNode[]): StegoFragmentNode {
  return {
    kind: "fragment",
    children
  };
}

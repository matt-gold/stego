import type { StegoKeepTogetherNode, StegoNode } from "../types.ts";

export function createKeepTogetherNode(children: StegoNode[]): StegoKeepTogetherNode {
  return {
    kind: "keepTogether",
    children
  };
}

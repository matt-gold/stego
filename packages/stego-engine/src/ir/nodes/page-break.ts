import type { StegoPageBreakNode } from "../types.ts";

export function createPageBreakNode(): StegoPageBreakNode {
  return {
    kind: "pageBreak"
  };
}

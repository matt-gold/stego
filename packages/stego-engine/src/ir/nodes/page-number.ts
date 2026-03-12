import type { StegoPageNumberNode } from "../types.ts";

export function createPageNumberNode(): StegoPageNumberNode {
  return {
    kind: "pageNumber"
  };
}

import type { StegoTextNode } from "../types.ts";

export function createTextNode(value: string): StegoTextNode {
  return {
    kind: "text",
    value
  };
}

import type { FontSizeValue, LineSpacingValue, StegoSpacerNode } from "../types.ts";

export function createSpacerNode(
  lines = 1,
  props: {
    fontSize?: FontSizeValue;
    lineSpacing?: LineSpacingValue;
  } = {},
): StegoSpacerNode {
  if (!Number.isInteger(lines) || !Number.isFinite(lines) || lines < 1) {
    throw new Error(`Spacer lines must be a positive integer. Received: ${String(lines)}`);
  }

  return {
    kind: "spacer",
    lines,
    fontSize: props.fontSize,
    lineSpacing: props.lineSpacing,
  };
}

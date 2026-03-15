import type { AlignValue, InsetValue, SpacingValue, StegoHeadingNode, StegoInlineNode } from "../types.ts";

export function createHeadingNode(
  level: StegoHeadingNode["level"],
  props: {
    spaceBefore?: SpacingValue;
    spaceAfter?: SpacingValue;
    insetLeft?: InsetValue;
    insetRight?: InsetValue;
    align?: AlignValue;
  },
  children: StegoInlineNode[]
): StegoHeadingNode {
  return {
    kind: "heading",
    level,
    spaceBefore: props.spaceBefore,
    spaceAfter: props.spaceAfter,
    insetLeft: props.insetLeft,
    insetRight: props.insetRight,
    align: props.align,
    children
  };
}

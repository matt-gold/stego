import type { AlignValue, IndentValue, InsetValue, SpacingValue, StegoInlineNode, StegoParagraphNode } from "../types.ts";

export function createParagraphNode(
  props: {
    spaceBefore?: SpacingValue;
    spaceAfter?: SpacingValue;
    insetLeft?: InsetValue;
    insetRight?: InsetValue;
    firstLineIndent?: IndentValue;
    align?: AlignValue;
  },
  children: StegoInlineNode[]
): StegoParagraphNode {
  return {
    kind: "paragraph",
    spaceBefore: props.spaceBefore,
    spaceAfter: props.spaceAfter,
    insetLeft: props.insetLeft,
    insetRight: props.insetRight,
    firstLineIndent: props.firstLineIndent,
    align: props.align,
    children
  };
}

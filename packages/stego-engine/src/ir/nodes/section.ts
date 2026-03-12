import type { AlignValue, IndentValue, InsetValue, SpacingValue, StegoNode, StegoSectionNode } from "../types.ts";

export function createSectionNode(
  props: {
    role?: StegoSectionNode["role"];
    id?: string;
    spaceBefore?: SpacingValue;
    spaceAfter?: SpacingValue;
    insetLeft?: InsetValue;
    insetRight?: InsetValue;
    firstLineIndent?: IndentValue;
    align?: AlignValue;
  },
  children: StegoNode[]
): StegoSectionNode {
  return {
    kind: "section",
    role: props.role,
    id: props.id,
    spaceBefore: props.spaceBefore,
    spaceAfter: props.spaceAfter,
    insetLeft: props.insetLeft,
    insetRight: props.insetRight,
    firstLineIndent: props.firstLineIndent,
    align: props.align,
    children
  };
}

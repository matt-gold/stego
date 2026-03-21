import type {
  AlignValue,
  FontFamilyValue,
  FontSizeValue,
  IndentValue,
  InsetValue,
  LineSpacingValue,
  SpacingValue,
  StegoInlineNode,
  StegoParagraphNode
} from "../types.ts";

export function createParagraphNode(
  props: {
    spaceBefore?: SpacingValue;
    spaceAfter?: SpacingValue;
    insetLeft?: InsetValue;
    insetRight?: InsetValue;
    firstLineIndent?: IndentValue;
    align?: AlignValue;
    fontFamily?: FontFamilyValue;
    fontSize?: FontSizeValue;
    lineSpacing?: LineSpacingValue;
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
    fontFamily: props.fontFamily,
    fontSize: props.fontSize,
    lineSpacing: props.lineSpacing,
    children
  };
}

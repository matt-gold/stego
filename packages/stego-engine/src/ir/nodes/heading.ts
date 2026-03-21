import type {
  AlignValue,
  ColorValue,
  FontFamilyValue,
  FontSizeValue,
  FontWeightValue,
  InsetValue,
  LineSpacingValue,
  SpacingValue,
  StegoHeadingNode,
  StegoInlineNode
} from "../types.ts";

export function createHeadingNode(
  level: StegoHeadingNode["level"],
  props: {
    spaceBefore?: SpacingValue;
    spaceAfter?: SpacingValue;
    insetLeft?: InsetValue;
    insetRight?: InsetValue;
    align?: AlignValue;
    fontFamily?: FontFamilyValue;
    fontSize?: FontSizeValue;
    lineSpacing?: LineSpacingValue;
    fontWeight?: FontWeightValue;
    italic?: boolean;
    underline?: boolean;
    smallCaps?: boolean;
    color?: ColorValue;
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
    fontFamily: props.fontFamily,
    fontSize: props.fontSize,
    lineSpacing: props.lineSpacing,
    fontWeight: props.fontWeight,
    italic: props.italic,
    underline: props.underline,
    smallCaps: props.smallCaps,
    color: props.color,
    children
  };
}

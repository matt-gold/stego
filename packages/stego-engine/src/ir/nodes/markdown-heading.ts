import type {
  AlignValue,
  ColorValue,
  FontFamilyValue,
  FontSizeValue,
  FontWeightValue,
  InsetValue,
  LineSpacingValue,
  SpacingValue,
  StegoMarkdownHeadingNode
} from "../types.ts";

export function createMarkdownHeadingNode(
  level: StegoMarkdownHeadingNode["level"],
  source: string,
  anchorId?: string,
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
  } = {}
): StegoMarkdownHeadingNode {
  return {
    kind: "markdownHeading",
    level,
    source,
    anchorId,
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
    color: props.color
  };
}

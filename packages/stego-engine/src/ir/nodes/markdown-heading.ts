import type {
  FontFamilyValue,
  FontSizeValue,
  LineSpacingValue,
  StegoMarkdownHeadingNode
} from "../types.ts";

export function createMarkdownHeadingNode(
  level: StegoMarkdownHeadingNode["level"],
  source: string,
  anchorId?: string,
  props: {
    fontFamily?: FontFamilyValue;
    fontSize?: FontSizeValue;
    lineSpacing?: LineSpacingValue;
  } = {}
): StegoMarkdownHeadingNode {
  return {
    kind: "markdownHeading",
    level,
    source,
    anchorId,
    fontFamily: props.fontFamily,
    fontSize: props.fontSize,
    lineSpacing: props.lineSpacing
  };
}

import type {
  FontFamilyValue,
  FontSizeValue,
  LineSpacingValue,
  SpacingValue,
  StegoMarkdownParagraphNode
} from "../types.ts";

export function createMarkdownParagraphNode(
  source: string,
  props: {
    spaceBefore?: SpacingValue;
    spaceAfter?: SpacingValue;
    fontFamily?: FontFamilyValue;
    fontSize?: FontSizeValue;
    lineSpacing?: LineSpacingValue;
  } = {}
): StegoMarkdownParagraphNode {
  return {
    kind: "markdownParagraph",
    source,
    spaceBefore: props.spaceBefore,
    spaceAfter: props.spaceAfter,
    fontFamily: props.fontFamily,
    fontSize: props.fontSize,
    lineSpacing: props.lineSpacing
  };
}

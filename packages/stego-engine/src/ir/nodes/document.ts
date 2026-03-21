import type {
  FontFamilyValue,
  FontSizeValue,
  LineSpacingValue,
  PageSpec,
  SpacingValue,
  StegoDocumentNode,
  StegoNode
} from "../types.ts";

export function createDocumentNode(
  page: PageSpec | undefined,
  children: StegoNode[],
  typography?: {
    fontFamily?: FontFamilyValue;
    fontSize?: FontSizeValue;
    lineSpacing?: LineSpacingValue;
    parSpaceBefore?: SpacingValue;
    parSpaceAfter?: SpacingValue;
  }
): StegoDocumentNode {
  return {
    kind: "document",
    page,
    fontFamily: typography?.fontFamily,
    fontSize: typography?.fontSize,
    lineSpacing: typography?.lineSpacing,
    parSpaceBefore: typography?.parSpaceBefore,
    parSpaceAfter: typography?.parSpaceAfter,
    children
  };
}

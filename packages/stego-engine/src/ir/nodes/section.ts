import type {
  AlignValue,
  FontFamilyValue,
  FontSizeValue,
  IndentValue,
  InsetValue,
  LineSpacingValue,
  SpacingValue,
  StegoNode,
  StegoSectionNode
} from "../types.ts";

export function createSectionNode(
  props: {
    role?: StegoSectionNode["role"];
    id?: string;
    spaceBefore?: SpacingValue;
    spaceAfter?: SpacingValue;
    parSpaceBefore?: SpacingValue;
    parSpaceAfter?: SpacingValue;
    insetLeft?: InsetValue;
    insetRight?: InsetValue;
    firstLineIndent?: IndentValue;
    align?: AlignValue;
    fontFamily?: FontFamilyValue;
    fontSize?: FontSizeValue;
    lineSpacing?: LineSpacingValue;
  },
  children: StegoNode[]
): StegoSectionNode {
  return {
    kind: "section",
    role: props.role,
    id: props.id,
    spaceBefore: props.spaceBefore,
    spaceAfter: props.spaceAfter,
    parSpaceBefore: props.parSpaceBefore,
    parSpaceAfter: props.parSpaceAfter,
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

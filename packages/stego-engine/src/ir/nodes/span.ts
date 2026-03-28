import type {
  ColorValue,
  FontFamilyValue,
  FontSizeValue,
  FontWeightValue,
  StegoInlineNode,
  StegoSpanNode,
} from "../types.ts";

export function createSpanNode(
  props: {
    fontFamily?: FontFamilyValue;
    fontSize?: FontSizeValue;
    fontWeight?: FontWeightValue;
    italic?: boolean;
    underline?: boolean;
    smallCaps?: boolean;
    color?: ColorValue;
  },
  children: StegoInlineNode[],
): StegoSpanNode {
  return {
    kind: "span",
    fontFamily: props.fontFamily,
    fontSize: props.fontSize,
    fontWeight: props.fontWeight,
    italic: props.italic,
    underline: props.underline,
    smallCaps: props.smallCaps,
    color: props.color,
    children,
  };
}

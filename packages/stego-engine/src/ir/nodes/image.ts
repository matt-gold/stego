import type { AlignValue, SizeValue, StegoImageNode } from "../types.ts";

export function createImageNode(props: {
  src: string;
  alt?: string;
  width?: SizeValue;
  height?: SizeValue;
  layout?: "block" | "inline";
  align?: AlignValue;
  caption?: string;
}): StegoImageNode {
  return {
    kind: "image",
    src: props.src,
    alt: props.alt,
    width: props.width,
    height: props.height,
    layout: props.layout,
    align: props.align,
    caption: props.caption
  };
}

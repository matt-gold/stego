import type {
  BodyStyle,
  HeadingStyle,
  HeadingStyleMap,
  PageSpec,
  StegoDocumentNode,
  StegoNode
} from "../types.ts";

export function createDocumentNode(
  page: PageSpec | undefined,
  children: StegoNode[],
  styles?: {
    bodyStyle?: BodyStyle;
    headingStyle?: HeadingStyle;
    headingStyles?: HeadingStyleMap;
  }
): StegoDocumentNode {
  return {
    kind: "document",
    page,
    bodyStyle: styles?.bodyStyle,
    headingStyle: styles?.headingStyle,
    headingStyles: styles?.headingStyles,
    children
  };
}

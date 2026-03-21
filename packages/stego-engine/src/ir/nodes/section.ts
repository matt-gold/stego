import type {
  BodyStyle,
  HeadingStyle,
  HeadingStyleMap,
  StegoNode,
  StegoSectionNode
} from "../types.ts";

export function createSectionNode(
  props: {
    role?: StegoSectionNode["role"];
    id?: string;
    bodyStyle?: BodyStyle;
    headingStyle?: HeadingStyle;
    headingStyles?: HeadingStyleMap;
  },
  children: StegoNode[]
): StegoSectionNode {
  return {
    kind: "section",
    role: props.role,
    id: props.id,
    bodyStyle: props.bodyStyle,
    headingStyle: props.headingStyle,
    headingStyles: props.headingStyles,
    children
  };
}

import type {
  StegoDocumentNode,
  StegoFragmentNode,
  StegoHeadingNode,
  StegoImageNode,
  StegoLinkNode,
  StegoMarkdownNode,
  StegoNode,
  StegoPageBreakNode,
  StegoPageNumberNode,
  StegoPageTemplateNode,
  StegoPlainTextNode,
  StegoParagraphNode,
  StegoSectionNode,
  StegoSpanNode,
  StegoTextNode
} from "../../ir/index.ts";
import { Fragment } from "../public/components.ts";

export { Fragment };

export namespace JSX {
  export type Element =
    | StegoNode
    | StegoDocumentNode
    | StegoFragmentNode
    | StegoSectionNode
    | StegoHeadingNode
    | StegoParagraphNode
    | StegoMarkdownNode
    | StegoPlainTextNode
    | StegoImageNode
    | StegoPageBreakNode
    | StegoPageTemplateNode
    | StegoPageNumberNode
    | StegoSpanNode
    | StegoTextNode
    | StegoLinkNode;
  export type ElementType = (props: any) => Element;
  export interface ElementChildrenAttribute {
    children: unknown;
  }
  export interface IntrinsicElements {}
  export interface IntrinsicAttributes {
    key?: string | number;
  }
}

export function jsx<Props, Result extends JSX.Element>(
  type: (props: Props) => Result,
  props: Props
): Result {
  return createElement(type, props);
}

export function jsxs<Props, Result extends JSX.Element>(
  type: (props: Props) => Result,
  props: Props
): Result {
  return createElement(type, props);
}

function createElement<Props, Result extends JSX.Element>(
  type: (props: Props) => Result,
  props: Props
): Result {
  if (typeof type !== "function") {
    throw new Error("Only Stego components and local helper functions are supported in templates.");
  }
  return type(props);
}

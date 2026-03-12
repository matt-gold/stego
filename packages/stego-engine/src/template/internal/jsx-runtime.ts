import type {
  StegoDocumentNode,
  StegoFragmentNode,
  StegoHeadingNode,
  StegoImageNode,
  StegoMarkdownNode,
  StegoNode,
  StegoPageBreakNode,
  StegoPageNumberNode,
  StegoPageTemplateNode,
  StegoParagraphNode,
  StegoSectionNode,
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
    | StegoImageNode
    | StegoPageBreakNode
    | StegoPageTemplateNode
    | StegoPageNumberNode
    | StegoTextNode;
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

import {
  createDocumentNode,
  createFragmentNode,
  createKeepTogetherNode,
  createHeadingNode,
  createImageNode,
  createMarkdownNode,
  createPageBreakNode,
  createPageNumberNode,
  createPageTemplateNode,
  createParagraphNode,
  createSectionNode,
  type AlignValue,
  type IndentValue,
  type InsetValue,
  type PageRegionSpec,
  type PageSpec,
  type SizeValue,
  type SpacingValue,
  type StegoDocumentNode,
  type StegoFragmentNode,
  type StegoHeadingNode,
  type StegoImageNode,
  type StegoKeepTogetherNode,
  type StegoMarkdownNode,
  type StegoPageBreakNode,
  type StegoPageNumberNode,
  type StegoPageTemplateNode,
  type StegoParagraphNode,
  type StegoSectionNode
} from "../../ir/index.ts";
import { normalizeChildren } from "../internal/normalizeChildren.ts";

export function Document(props: { page?: PageSpec; children?: unknown }): StegoDocumentNode {
  return createDocumentNode(props.page, normalizeChildren(props.children));
}

export function Fragment(props: { children?: unknown }): StegoFragmentNode {
  return createFragmentNode(normalizeChildren(props.children));
}

export function KeepTogether(props: { children?: unknown }): StegoKeepTogetherNode {
  return createKeepTogetherNode(normalizeChildren(props.children));
}

export function Section(props: {
  role?: StegoSectionNode["role"];
  id?: string;
  spaceBefore?: SpacingValue;
  spaceAfter?: SpacingValue;
  insetLeft?: InsetValue;
  insetRight?: InsetValue;
  firstLineIndent?: IndentValue;
  align?: AlignValue;
  children?: unknown;
}): StegoSectionNode {
  return createSectionNode(props, normalizeChildren(props.children));
}

export function Heading(props: {
  level: StegoHeadingNode["level"];
  spaceBefore?: SpacingValue;
  spaceAfter?: SpacingValue;
  insetLeft?: InsetValue;
  insetRight?: InsetValue;
  align?: AlignValue;
  children?: unknown;
}): StegoHeadingNode {
  return createHeadingNode(props.level, props, normalizeChildren(props.children));
}

export function Paragraph(props: {
  spaceBefore?: SpacingValue;
  spaceAfter?: SpacingValue;
  insetLeft?: InsetValue;
  insetRight?: InsetValue;
  firstLineIndent?: IndentValue;
  align?: AlignValue;
  children?: unknown;
}): StegoParagraphNode {
  return createParagraphNode(props, normalizeChildren(props.children));
}

export function Markdown(props: { source: string }): StegoMarkdownNode {
  return createMarkdownNode(props.source);
}

export function Image(props: {
  src: string;
  alt?: string;
  width?: SizeValue;
  height?: SizeValue;
  layout?: "block" | "inline";
  align?: AlignValue;
  caption?: string;
}): StegoImageNode {
  return createImageNode(props);
}

export function PageBreak(): StegoPageBreakNode {
  return createPageBreakNode();
}

export function PageTemplate(props: {
  header?: PageRegionSpec;
  footer?: PageRegionSpec;
}): StegoPageTemplateNode {
  return createPageTemplateNode(props.header, props.footer);
}

export function PageNumber(): StegoPageNumberNode {
  return createPageNumberNode();
}

export const Stego = {
  Document,
  Fragment,
  KeepTogether,
  Section,
  Heading,
  Paragraph,
  Markdown,
  Image,
  PageBreak,
  PageTemplate,
  PageNumber
} as const;

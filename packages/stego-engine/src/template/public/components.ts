import {
  createDocumentNode,
  createFragmentNode,
  createKeepTogetherNode,
  createHeadingNode,
  createImageNode,
  createMarkdownNode,
  createLinkNode,
  createPageBreakNode,
  createPageNumberNode,
  createPageTemplateNode,
  createPlainTextNode,
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
  type StegoInlineNode,
  type StegoLinkNode,
  type StegoKeepTogetherNode,
  type StegoMarkdownNode,
  type StegoPageBreakNode,
  type StegoPageNumberNode,
  type StegoPageTemplateNode,
  type StegoPlainTextNode,
  type StegoParagraphNode,
  type StegoSectionNode
} from "../../ir/index.ts";
import { groupCollectionItems, splitCollectionItems, type Group, type GroupSelector, type SplitGroup } from "../../collections/index.ts";
import type { LeafMetadata, LeafRecord } from "./types.ts";
import { normalizeChildren, normalizeInlineChildren } from "../internal/normalizeChildren.ts";

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
  return createHeadingNode(props.level, props, normalizeInlineChildren(props.children));
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
  return createParagraphNode(props, normalizeInlineChildren(props.children));
}

export function Markdown<TMetadata extends LeafMetadata>(
  props: { source: string; leaf?: never } | { leaf: LeafRecord<TMetadata>; source?: never }
): StegoMarkdownNode {
  if ("leaf" in props && props.leaf) {
    return createMarkdownNode({
      leaf: {
        id: props.leaf.id,
        body: props.leaf.body
      }
    });
  }
  return createMarkdownNode({ source: props.source });
}

export function PlainText<TMetadata extends LeafMetadata>(
  props: { source: string; leaf?: never } | { leaf: LeafRecord<TMetadata>; source?: never }
): StegoPlainTextNode {
  if ("leaf" in props && props.leaf) {
    return createPlainTextNode({
      leaf: {
        id: props.leaf.id,
        body: props.leaf.body
      }
    });
  }
  return createPlainTextNode({ source: props.source });
}

export function Link(props: {
  leaf: string;
  heading?: string;
  anchor?: string;
  children?: unknown;
}): StegoLinkNode {
  if (props.heading && props.anchor) {
    throw new Error("<Stego.Link /> accepts either heading or anchor, not both.");
  }
  return createLinkNode(props.leaf, props, normalizeInlineChildren(props.children));
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

export function groupBy<T>(items: T[], selector: GroupSelector<T>): Group<T>[] {
  return groupCollectionItems(items, selector);
}

export function splitBy<T>(items: T[], selector: GroupSelector<T>): SplitGroup<T>[] {
  return splitCollectionItems(items, selector);
}

export const Stego = {
  Document,
  Fragment,
  KeepTogether,
  Section,
  Heading,
  Paragraph,
  Markdown,
  PlainText,
  Link,
  Image,
  PageBreak,
  PageTemplate,
  PageNumber,
  groupBy,
  splitBy
} as const;

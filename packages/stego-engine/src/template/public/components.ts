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
import type { PresentationTarget, TemplateCapability } from "@stego-labs/shared/domain/templates";
import { TARGET_CAPABILITIES } from "@stego-labs/shared/domain/templates";
import { normalizeChildren, normalizeInlineChildren } from "../internal/normalizeChildren.ts";

export type DocumentProps = {
  page?: PageSpec;
  children?: unknown;
};

export type SectionProps = {
  role?: StegoSectionNode["role"];
  id?: string;
  spaceBefore?: SpacingValue;
  spaceAfter?: SpacingValue;
  insetLeft?: InsetValue;
  insetRight?: InsetValue;
  firstLineIndent?: IndentValue;
  align?: AlignValue;
  children?: unknown;
};

export type HeadingProps = {
  level: StegoHeadingNode["level"];
  spaceBefore?: SpacingValue;
  spaceAfter?: SpacingValue;
  insetLeft?: InsetValue;
  insetRight?: InsetValue;
  align?: AlignValue;
  children?: unknown;
};

export type ParagraphProps = {
  spaceBefore?: SpacingValue;
  spaceAfter?: SpacingValue;
  insetLeft?: InsetValue;
  insetRight?: InsetValue;
  firstLineIndent?: IndentValue;
  align?: AlignValue;
  children?: unknown;
};

export type ImageProps = {
  src: string;
  alt?: string;
  width?: SizeValue;
  height?: SizeValue;
  layout?: "block" | "inline";
  align?: AlignValue;
  caption?: string;
};

type CapabilityMap = typeof TARGET_CAPABILITIES;
type AllTargetsSupport<TTargets extends PresentationTarget, TCapability extends TemplateCapability> =
  false extends (TTargets extends any ? CapabilityMap[TTargets][TCapability] : never) ? false : true;

type GatedProps<
  TTargets extends PresentationTarget,
  TCapability extends TemplateCapability,
  TProps extends object
> = AllTargetsSupport<TTargets, TCapability> extends true
  ? TProps
  : { [TKey in keyof TProps]?: never };

type NarrowDocumentProps<TTargets extends PresentationTarget> = {
  children?: unknown;
} & GatedProps<TTargets, "pageLayout", { page?: PageSpec }>;

type NarrowSectionProps<TTargets extends PresentationTarget> = {
  role?: StegoSectionNode["role"];
  id?: string;
  children?: unknown;
} & GatedProps<TTargets, "spacing", {
  spaceBefore?: SpacingValue;
  spaceAfter?: SpacingValue;
}> & GatedProps<TTargets, "inset", {
  insetLeft?: InsetValue;
  insetRight?: InsetValue;
}> & GatedProps<TTargets, "indent", {
  firstLineIndent?: IndentValue;
}> & GatedProps<TTargets, "align", {
  align?: AlignValue;
}>;

type NarrowHeadingProps<TTargets extends PresentationTarget> = {
  level: StegoHeadingNode["level"];
  children?: unknown;
} & GatedProps<TTargets, "spacing", {
  spaceBefore?: SpacingValue;
  spaceAfter?: SpacingValue;
}> & GatedProps<TTargets, "inset", {
  insetLeft?: InsetValue;
  insetRight?: InsetValue;
}> & GatedProps<TTargets, "align", {
  align?: AlignValue;
}>;

type NarrowParagraphProps<TTargets extends PresentationTarget> = {
  children?: unknown;
} & GatedProps<TTargets, "spacing", {
  spaceBefore?: SpacingValue;
  spaceAfter?: SpacingValue;
}> & GatedProps<TTargets, "inset", {
  insetLeft?: InsetValue;
  insetRight?: InsetValue;
}> & GatedProps<TTargets, "indent", {
  firstLineIndent?: IndentValue;
}> & GatedProps<TTargets, "align", {
  align?: AlignValue;
}>;

type NarrowImageProps<TTargets extends PresentationTarget> = {
  src: string;
  alt?: string;
  width?: SizeValue;
  height?: SizeValue;
  caption?: string;
} & GatedProps<TTargets, "imageLayout", {
  layout?: "block" | "inline";
}> & GatedProps<TTargets, "imageAlign", {
  align?: AlignValue;
}>;

type NarrowDocumentComponent<TTargets extends PresentationTarget> = (props: NarrowDocumentProps<TTargets>) => StegoDocumentNode;
type NarrowSectionComponent<TTargets extends PresentationTarget> = (props: NarrowSectionProps<TTargets>) => StegoSectionNode;
type NarrowHeadingComponent<TTargets extends PresentationTarget> = (props: NarrowHeadingProps<TTargets>) => StegoHeadingNode;
type NarrowParagraphComponent<TTargets extends PresentationTarget> = (props: NarrowParagraphProps<TTargets>) => StegoParagraphNode;
type NarrowImageComponent<TTargets extends PresentationTarget> = (props: NarrowImageProps<TTargets>) => StegoImageNode;
type MaybeComponent<
  TKey extends string,
  TTargets extends PresentationTarget,
  TCapability extends TemplateCapability,
  TValue
> = AllTargetsSupport<TTargets, TCapability> extends true
  ? { [TProp in TKey]: TValue }
  : {};

export type StegoApi<TTargets extends PresentationTarget> = {
  Document: NarrowDocumentComponent<TTargets>;
  Fragment: typeof Fragment;
  Section: NarrowSectionComponent<TTargets>;
  Heading: NarrowHeadingComponent<TTargets>;
  Paragraph: NarrowParagraphComponent<TTargets>;
  Markdown: typeof Markdown;
  PlainText: typeof PlainText;
  Link: typeof Link;
  Image: NarrowImageComponent<TTargets>;
  groupBy: typeof groupBy;
  splitBy: typeof splitBy;
} & MaybeComponent<"KeepTogether", TTargets, "keepTogether", typeof KeepTogether>
  & MaybeComponent<"PageBreak", TTargets, "pageBreak", typeof PageBreak>
  & MaybeComponent<"PageTemplate", TTargets, "pageTemplate", typeof PageTemplate>
  & MaybeComponent<"PageNumber", TTargets, "pageNumber", typeof PageNumber>;

export function Document(props: DocumentProps): StegoDocumentNode {
  return createDocumentNode(props.page, normalizeChildren(props.children));
}

export function Fragment(props: { children?: unknown }): StegoFragmentNode {
  return createFragmentNode(normalizeChildren(props.children));
}

export function KeepTogether(props: { children?: unknown }): StegoKeepTogetherNode {
  return createKeepTogetherNode(normalizeChildren(props.children));
}

export function Section(props: SectionProps): StegoSectionNode {
  return createSectionNode(props, normalizeChildren(props.children));
}

export function Heading(props: HeadingProps): StegoHeadingNode {
  return createHeadingNode(props.level, props, normalizeInlineChildren(props.children));
}

export function Paragraph(props: ParagraphProps): StegoParagraphNode {
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

export function Image(props: ImageProps): StegoImageNode {
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

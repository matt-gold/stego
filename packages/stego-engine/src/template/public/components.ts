import {
  type BodyStyle,
  type ColorValue,
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
  createSpacerNode,
  createSectionNode,
  createSpanNode,
  type AlignValue,
  type FontFamilyValue,
  type FontSizeValue,
  type FontWeightValue,
  type HeadingLevel,
  type HeadingStyle,
  type HeadingStyleMap,
  type IndentValue,
  type InsetValue,
  type LineSpacingValue,
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
  type StegoSpacerNode,
  type StegoSectionNode
} from "../../ir/index.ts";
import { groupCollectionItems, splitCollectionItems, type Group, type GroupSelector, type SplitGroup } from "../../collections/index.ts";
import {
  getText as getContentText,
  getTextTokens as getContentTextTokens,
  getWords as getContentWords,
  getWordCount as getContentWordCount,
} from "@stego-labs/shared/domain/content";
import type { LeafMetadata, LeafRecord } from "./types.ts";
import type { PresentationTarget, TemplateCapability } from "@stego-labs/shared/domain/templates";
import { TARGET_CAPABILITIES } from "@stego-labs/shared/domain/templates";
import { normalizeChildren, normalizeInlineChildren } from "../internal/normalizeChildren.ts";
import { normalizePageRegionChildren } from "../internal/normalizePageRegionChildren.ts";

export type DocumentProps = {
  page?: PageSpec;
  bodyStyle?: BodyStyle;
  headingStyle?: HeadingStyle;
  headingStyles?: HeadingStyleMap;
  children?: unknown;
};

export type SectionProps = {
  role?: StegoSectionNode["role"];
  id?: string;
  bodyStyle?: BodyStyle;
  headingStyle?: HeadingStyle;
  headingStyles?: HeadingStyleMap;
  children?: unknown;
};

export type HeadingProps = {
  level: StegoHeadingNode["level"];
  spaceBefore?: SpacingValue;
  spaceAfter?: SpacingValue;
  insetLeft?: InsetValue;
  insetRight?: InsetValue;
  align?: AlignValue;
  fontFamily?: FontFamilyValue;
  fontSize?: FontSizeValue;
  lineSpacing?: LineSpacingValue;
  fontWeight?: FontWeightValue;
  italic?: boolean;
  underline?: boolean;
  smallCaps?: boolean;
  color?: ColorValue;
  children?: unknown;
};

export type ParagraphProps = {
  spaceBefore?: SpacingValue;
  spaceAfter?: SpacingValue;
  insetLeft?: InsetValue;
  insetRight?: InsetValue;
  firstLineIndent?: IndentValue;
  align?: AlignValue;
  fontFamily?: FontFamilyValue;
  fontSize?: FontSizeValue;
  lineSpacing?: LineSpacingValue;
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

export type SpanProps = {
  fontFamily?: FontFamilyValue;
  fontSize?: FontSizeValue;
  fontWeight?: FontWeightValue;
  italic?: boolean;
  underline?: boolean;
  smallCaps?: boolean;
  color?: ColorValue;
  children?: unknown;
};

export type SpacerProps = {
  lines?: number;
  fontSize?: FontSizeValue;
  lineSpacing?: LineSpacingValue;
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

type NarrowFontProps<TTargets extends PresentationTarget> =
  GatedProps<TTargets, "fontFamily", { fontFamily?: FontFamilyValue; }>
  & GatedProps<TTargets, "fontSize", { fontSize?: FontSizeValue; }>
  & GatedProps<TTargets, "lineSpacing", { lineSpacing?: LineSpacingValue; }>;

type NarrowHeadingEmphasisProps<TTargets extends PresentationTarget> =
  GatedProps<TTargets, "fontWeight", { fontWeight?: FontWeightValue; }>
  & GatedProps<TTargets, "italic", { italic?: boolean; }>
  & GatedProps<TTargets, "underline", { underline?: boolean; }>
  & GatedProps<TTargets, "smallCaps", { smallCaps?: boolean; }>
  & GatedProps<TTargets, "textColor", { color?: ColorValue; }>;

type NarrowBodyStyle<TTargets extends PresentationTarget> =
  GatedProps<TTargets, "spacing", {
    spaceBefore?: SpacingValue;
    spaceAfter?: SpacingValue;
  }>
  & GatedProps<TTargets, "inset", {
    insetLeft?: InsetValue;
    insetRight?: InsetValue;
  }>
  & GatedProps<TTargets, "indent", {
    firstLineIndent?: IndentValue;
  }>
  & GatedProps<TTargets, "align", {
    align?: AlignValue;
  }>
  & NarrowFontProps<TTargets>;

type NarrowHeadingStyle<TTargets extends PresentationTarget> =
  GatedProps<TTargets, "spacing", {
    spaceBefore?: SpacingValue;
    spaceAfter?: SpacingValue;
  }>
  & GatedProps<TTargets, "inset", {
    insetLeft?: InsetValue;
    insetRight?: InsetValue;
  }>
  & GatedProps<TTargets, "align", {
    align?: AlignValue;
  }>
  & NarrowFontProps<TTargets>
  & NarrowHeadingEmphasisProps<TTargets>;

type NarrowDocumentProps<TTargets extends PresentationTarget> = {
  children?: unknown;
} & GatedProps<TTargets, "pageLayout", { page?: PageSpec }>
  & {
    bodyStyle?: NarrowBodyStyle<TTargets>;
    headingStyle?: NarrowHeadingStyle<TTargets>;
    headingStyles?: Partial<Record<HeadingLevel, NarrowHeadingStyle<TTargets>>>;
  };

type NarrowSectionProps<TTargets extends PresentationTarget> = {
  role?: StegoSectionNode["role"];
  id?: string;
  children?: unknown;
} & {
  bodyStyle?: NarrowBodyStyle<TTargets>;
  headingStyle?: NarrowHeadingStyle<TTargets>;
  headingStyles?: Partial<Record<HeadingLevel, NarrowHeadingStyle<TTargets>>>;
};

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
}> & NarrowFontProps<TTargets>
  & NarrowHeadingEmphasisProps<TTargets>;

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
}> & NarrowFontProps<TTargets>;

type NarrowSpanProps<TTargets extends PresentationTarget> = {
  children?: unknown;
} & GatedProps<TTargets, "fontFamily", { fontFamily?: FontFamilyValue; }>
  & GatedProps<TTargets, "fontSize", { fontSize?: FontSizeValue; }>
  & NarrowHeadingEmphasisProps<TTargets>;

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
type NarrowSpanComponent<TTargets extends PresentationTarget> = (props: NarrowSpanProps<TTargets>) => ReturnType<typeof Span>;
type NarrowSpacerProps<TTargets extends PresentationTarget> = {
  lines?: number;
} & GatedProps<TTargets, "fontSize", { fontSize?: FontSizeValue; }>
  & GatedProps<TTargets, "lineSpacing", { lineSpacing?: LineSpacingValue; }>;
type NarrowSpacerComponent<TTargets extends PresentationTarget> = (props: NarrowSpacerProps<TTargets>) => StegoSpacerNode;
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
  Spacer: NarrowSpacerComponent<TTargets>;
  Span: NarrowSpanComponent<TTargets>;
  Markdown: typeof Markdown;
  PlainText: typeof PlainText;
  Link: typeof Link;
  Image: NarrowImageComponent<TTargets>;
  groupBy: typeof groupBy;
  splitBy: typeof splitBy;
  getText: typeof getText;
  getTextTokens: typeof getTextTokens;
  getWords: typeof getWords;
  getWordCount: typeof getWordCount;
} & MaybeComponent<"KeepTogether", TTargets, "keepTogether", typeof KeepTogether>
  & MaybeComponent<"PageBreak", TTargets, "pageBreak", typeof PageBreak>
  & MaybeComponent<"PageTemplate", TTargets, "pageTemplate", typeof PageTemplate>
  & MaybeComponent<"PageNumber", TTargets, "pageNumber", typeof PageNumber>;

export function Document(props: DocumentProps): StegoDocumentNode {
  assertNoLegacyDocumentStyleProps(props);
  return createDocumentNode(props.page, normalizeChildren(props.children), {
    bodyStyle: props.bodyStyle,
    headingStyle: props.headingStyle,
    headingStyles: props.headingStyles
  });
}

export function Fragment(props: { children?: unknown }): StegoFragmentNode {
  return createFragmentNode(normalizeChildren(props.children));
}

export function KeepTogether(props: { children?: unknown }): StegoKeepTogetherNode {
  return createKeepTogetherNode(normalizeChildren(props.children));
}

export function Section(props: SectionProps): StegoSectionNode {
  assertNoLegacySectionStyleProps(props);
  return createSectionNode({
    role: props.role,
    id: props.id,
    bodyStyle: props.bodyStyle,
    headingStyle: props.headingStyle,
    headingStyles: props.headingStyles
  }, normalizeChildren(props.children));
}

export function Heading(props: HeadingProps): StegoHeadingNode {
  return createHeadingNode(props.level, props, normalizeInlineChildren(props.children));
}

export function Paragraph(props: ParagraphProps): StegoParagraphNode {
  return createParagraphNode(props, normalizeInlineChildren(props.children));
}

export function Spacer(props: SpacerProps = {}): StegoSpacerNode {
  return createSpacerNode(props.lines ?? 1, {
    fontSize: props.fontSize,
    lineSpacing: props.lineSpacing,
  });
}

export function Span(props: SpanProps) {
  return createSpanNode(props, normalizeInlineChildren(props.children));
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
  header?: { left?: unknown; center?: unknown; right?: unknown };
  footer?: { left?: unknown; center?: unknown; right?: unknown };
  children?: unknown;
}): StegoPageTemplateNode {
  const header: PageRegionSpec | undefined = props.header
    ? {
        left: normalizePageRegionChildren(props.header.left),
        center: normalizePageRegionChildren(props.header.center),
        right: normalizePageRegionChildren(props.header.right),
      }
    : undefined;
  const footer: PageRegionSpec | undefined = props.footer
    ? {
        left: normalizePageRegionChildren(props.footer.left),
        center: normalizePageRegionChildren(props.footer.center),
        right: normalizePageRegionChildren(props.footer.right),
      }
    : undefined;
  const children = normalizeChildren(props.children);
  if (children.length === 0) {
    throw new Error("<Stego.PageTemplate> must wrap one or more child nodes in V1.");
  }
  return createPageTemplateNode(header, footer, children);
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

export function getText<T extends { body: string }>(
  input: T | T[] | string | string[],
): string {
  return getContentText(input as { body: string } | { body: string }[] | string | string[]);
}

export function getTextTokens<T extends { body: string }>(
  input: T | T[] | string | string[],
) {
  return getContentTextTokens(input as { body: string } | { body: string }[] | string | string[]);
}

export function getWords<T extends { body: string }>(
  input: T | T[] | string | string[],
): string[] {
  return getContentWords(input as { body: string } | { body: string }[] | string | string[]);
}

export function getWordCount<T extends { body: string }>(
  input: T | T[] | string | string[],
): number {
  return getContentWordCount(input as { body: string } | { body: string }[] | string | string[]);
}

function assertNoLegacyDocumentStyleProps(props: Record<string, unknown>): void {
  const legacy = ["fontFamily", "fontSize", "lineSpacing", "parSpaceBefore", "parSpaceAfter"].filter(
    (key) => props[key] !== undefined
  );
  if (legacy.length === 0) {
    return;
  }
  throw new Error(
    `<Stego.Document> no longer accepts ${legacy.join(", ")}. Use bodyStyle={{ ... }} instead.`
  );
}

function assertNoLegacySectionStyleProps(props: Record<string, unknown>): void {
  const legacy = [
    "spaceBefore",
    "spaceAfter",
    "parSpaceBefore",
    "parSpaceAfter",
    "insetLeft",
    "insetRight",
    "firstLineIndent",
    "align",
    "fontFamily",
    "fontSize",
    "lineSpacing"
  ].filter((key) => props[key] !== undefined);

  if (legacy.length === 0) {
    return;
  }

  throw new Error(
    `<Stego.Section> no longer accepts ${legacy.join(", ")}. Use bodyStyle={{ ... }} and headingStyle/headingStyles instead.`
  );
}

export const Stego = {
  Document,
  Fragment,
  KeepTogether,
  Section,
  Heading,
  Paragraph,
  Spacer,
  Span,
  Markdown,
  PlainText,
  Link,
  Image,
  PageBreak,
  PageTemplate,
  PageNumber,
  groupBy,
  splitBy,
  getText,
  getTextTokens,
  getWords,
  getWordCount,
} as const;

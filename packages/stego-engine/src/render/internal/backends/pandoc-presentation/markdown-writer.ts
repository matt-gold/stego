import {
  buildLeafRootAnchor,
  findLeafHeadingTarget,
  injectLeafHeadingAnchors,
  type LeafHeadingTarget
} from "@stego-labs/shared/domain/content";
import { createPresentationMarkerId } from "@stego-labs/shared/domain/presentation";
import type {
  AlignValue,
  ColorValue,
  FontFamilyValue,
  FontSizeValue,
  FontWeightValue,
  IndentValue,
  InsetValue,
  LineSpacingValue,
  SpacingValue,
  StegoInlineNode,
  StegoSpanNode,
  StegoNode
} from "../../../../ir/index.ts";
import type { PresentationBlockMarker, PresentationInlineStyleSpec } from "../../../public/types.ts";
import { normalizeHexColor } from "../../../../style/index.ts";
import type { LeafRecord } from "../../../../template/index.ts";
import { formatSizeValue, formatSpacingValue } from "../../normalize/index.ts";

type LeafIndexEntry = {
  id: string;
  titleFromFilename: string;
  metadata: Record<string, unknown>;
  headings: LeafHeadingTarget[];
};

export function writePandocMarkdown(
  nodes: StegoNode[],
  leaves: LeafRecord[],
  options: {
    spaceBefore?: SpacingValue;
    spaceAfter?: SpacingValue;
  } = {}
): {
  markdown: string;
  blockMarkers: PresentationBlockMarker[];
  inlineStyles: PresentationInlineStyleSpec[];
  usesBlockFontFamily: boolean;
  usesBlockLineSpacing: boolean;
  usesUnderline: boolean;
  usesTextColor: boolean;
} {
  const blocks: string[] = [];
  const context = {
    presentationMarkerIndex: 0,
    inlineStyleIndex: 0,
    blockMarkers: [] as PresentationBlockMarker[],
    inlineStyles: [] as PresentationInlineStyleSpec[],
    inlineStyleIds: new Map<string, string>(),
    usesBlockFontFamily: false,
    usesBlockLineSpacing: false,
    usesUnderline: false,
    usesTextColor: false,
    defaultParagraphSpaceBefore: formatSpacingValue(options.spaceBefore ?? 0),
    defaultParagraphSpaceAfter: formatSpacingValue(options.spaceAfter ?? 0),
    leaves: new Map(leaves.map((leaf) => [leaf.id, {
      id: leaf.id,
      titleFromFilename: leaf.titleFromFilename,
      metadata: leaf.metadata,
      headings: leaf.headings
    } satisfies LeafIndexEntry]))
  };

  for (const node of nodes) {
    if (node.kind === "pageTemplate") {
      continue;
    }
    const rendered = renderNode(node, context);
    if (!rendered) {
      continue;
    }
    blocks.push(rendered);
  }

  return {
    markdown: `${blocks.join("\n\n").replace(/\n{3,}/g, "\n\n")}\n`,
    blockMarkers: context.blockMarkers,
    inlineStyles: context.inlineStyles,
    usesBlockFontFamily: context.usesBlockFontFamily,
    usesBlockLineSpacing: context.usesBlockLineSpacing,
    usesUnderline: context.usesUnderline,
    usesTextColor: context.usesTextColor
  };
}

function renderNode(node: StegoNode, context: RenderContext): string {
  switch (node.kind) {
    case "document":
    case "fragment":
      return node.children.map((child) => renderNode(child, context)).filter(Boolean).join("\n\n");
    case "keepTogether": {
      const markerId = createPresentationMarkerId(++context.presentationMarkerIndex);
      context.blockMarkers.push({
        markerId,
        keepTogether: true
      });
      const body = node.children.map((child) => renderNode(child, context)).filter(Boolean).join("\n\n");
      return `::: {#${markerId} data-keep-together=true}\n${body}\n:::`;
    }
    case "pageTemplate":
      return "";
    case "section": {
      const body = node.children.map((child) => renderNode(child, context)).filter(Boolean).join("\n\n");
      const attrs = renderRawAttrs({
        id: node.id,
        tokens: node.role ? [`data-role=${node.role}`] : []
      });
      return attrs ? `::: ${attrs}\n${body}\n:::` : body;
    }
    case "heading": {
      const layout = toPresentationBlockMarker({
        spaceBefore: node.spaceBefore,
        spaceAfter: node.spaceAfter,
        insetLeft: node.insetLeft,
        insetRight: node.insetRight,
        align: node.align,
        fontFamily: node.fontFamily,
        fontSize: node.fontSize,
        lineSpacing: node.lineSpacing,
        fontWeight: node.fontWeight,
        italic: node.italic,
        underline: node.underline,
        smallCaps: node.smallCaps,
        color: node.color
      });
      const body = `${"#".repeat(node.level)} ${renderInlineChildren(node.children, context)}`;
      if (!layout) {
        return body;
      }
      const markerId = createPresentationMarkerId(++context.presentationMarkerIndex);
      context.blockMarkers.push({
        markerId,
        ...layout
      });
      trackBlockStyleUsage(context, layout);
      const attrs = renderBlockAttrs({
        id: markerId,
        spaceBefore: node.spaceBefore,
        spaceAfter: node.spaceAfter,
        insetLeft: node.insetLeft,
        insetRight: node.insetRight,
        align: node.align,
        fontFamily: node.fontFamily,
        fontSize: node.fontSize,
        lineSpacing: node.lineSpacing,
        fontWeight: node.fontWeight,
        italic: node.italic,
        underline: node.underline,
        smallCaps: node.smallCaps,
        color: node.color
      });
      return `::: ${attrs}\n${body}\n:::`;
    }
    case "paragraph": {
      const spacing = normalizeParagraphSpacingForDefaults(
        {
          spaceBefore: node.spaceBefore,
          spaceAfter: node.spaceAfter
        },
        context,
      );
      const markerId = getOrCreatePresentationMarker(context, {
        spaceBefore: spacing.spaceBefore,
        spaceAfter: spacing.spaceAfter,
        insetLeft: node.insetLeft,
        insetRight: node.insetRight,
        firstLineIndent: node.firstLineIndent,
        align: node.align,
        fontFamily: node.fontFamily,
        fontSize: node.fontSize,
        lineSpacing: node.lineSpacing
      });
      const attrs = renderBlockAttrs({
        id: markerId,
        spaceBefore: spacing.spaceBefore,
        spaceAfter: spacing.spaceAfter,
        insetLeft: node.insetLeft,
        insetRight: node.insetRight,
        firstLineIndent: node.firstLineIndent,
        align: node.align,
        fontFamily: node.fontFamily,
        fontSize: node.fontSize,
        lineSpacing: node.lineSpacing
      });
      const body = renderInlineChildren(node.children, context);
      return attrs ? `::: ${attrs}\n${body}\n:::` : body;
    }
    case "spacer": {
      const extraTokens = [`data-spacer-lines=${String(node.lines)}`];
      const fontSize = formatFontSizeValue(node.fontSize);
      const lineSpacing = formatLineSpacingValue(node.lineSpacing);
      if (fontSize) {
        extraTokens.push(`data-font-size=${fontSize}`);
      }
      if (lineSpacing !== undefined) {
        extraTokens.push(`data-line-spacing=${String(lineSpacing)}`);
      }
      return renderPresentationMarker(
        context,
        {
          spacerLines: node.lines,
          fontSizePt: formatFontSizeInPoints(node.fontSize),
          lineSpacing,
        },
        extraTokens,
      );
    }
    case "markdownParagraph": {
      const spacing = normalizeParagraphSpacingForDefaults(
        {
          spaceBefore: node.spaceBefore,
          spaceAfter: node.spaceAfter
        },
        context,
      );
      const markerId = getOrCreatePresentationMarker(context, {
        spaceBefore: spacing.spaceBefore,
        spaceAfter: spacing.spaceAfter,
        insetLeft: node.insetLeft,
        insetRight: node.insetRight,
        firstLineIndent: node.firstLineIndent,
        align: node.align,
        fontFamily: node.fontFamily,
        fontSize: node.fontSize,
        lineSpacing: node.lineSpacing
      });
      const attrs = renderBlockAttrs({
        id: markerId,
        spaceBefore: spacing.spaceBefore,
        spaceAfter: spacing.spaceAfter,
        insetLeft: node.insetLeft,
        insetRight: node.insetRight,
        firstLineIndent: node.firstLineIndent,
        align: node.align,
        fontFamily: node.fontFamily,
        fontSize: node.fontSize,
        lineSpacing: node.lineSpacing
      });
      return attrs ? `::: ${attrs}\n${node.source}\n:::` : node.source;
    }
    case "markdownHeading": {
      const body = renderMarkdownHeadingNode(node);
      const layout = toPresentationBlockMarker({
        spaceBefore: node.spaceBefore,
        spaceAfter: node.spaceAfter,
        insetLeft: node.insetLeft,
        insetRight: node.insetRight,
        align: node.align,
        fontFamily: node.fontFamily,
        fontSize: node.fontSize,
        lineSpacing: node.lineSpacing,
        fontWeight: node.fontWeight,
        italic: node.italic,
        underline: node.underline,
        smallCaps: node.smallCaps,
        color: node.color
      });
      if (!layout) {
        return body;
      }
      const markerId = createPresentationMarkerId(++context.presentationMarkerIndex);
      context.blockMarkers.push({
        markerId,
        ...layout
      });
      trackBlockStyleUsage(context, layout);
      const attrs = renderBlockAttrs({
        id: markerId,
        spaceBefore: node.spaceBefore,
        spaceAfter: node.spaceAfter,
        insetLeft: node.insetLeft,
        insetRight: node.insetRight,
        align: node.align,
        fontFamily: node.fontFamily,
        fontSize: node.fontSize,
        lineSpacing: node.lineSpacing,
        fontWeight: node.fontWeight,
        italic: node.italic,
        underline: node.underline,
        smallCaps: node.smallCaps,
        color: node.color
      });
      return `::: ${attrs}\n${body}\n:::`;
    }
    case "markdownBlock":
      return node.source;
    case "markdown":
      return renderMarkdownNode(node);
    case "plainText":
      return renderPlainTextNode(node);
    case "image": {
      const tokens = [];
      const width = formatSizeValue(node.width);
      const height = formatSizeValue(node.height);
      if (width) {
        tokens.push(`width=${width}`);
      }
      if (height) {
        tokens.push(`height=${height}`);
      }
      if (node.layout) {
        tokens.push(`data-layout=${node.layout}`);
      }
      if (node.align) {
        tokens.push(`data-align=${node.align}`);
      }
      const attrText = tokens.length > 0 ? `{${tokens.join(" ")}}` : "";
      const image = `![${node.alt ?? ""}](${node.src})${attrText}`;
      const body = !node.caption ? image : `${image}\n\n_${node.caption}_`;
      if (!node.align) {
        return body;
      }
      const markerId = createPresentationMarkerId(++context.presentationMarkerIndex);
      context.blockMarkers.push({
        markerId,
        align: node.align
      });
      return `::: {#${markerId}}\n${body}\n:::`;
    }
    case "pageBreak":
      return renderPresentationMarker(context, { pageBreak: true }, ["data-page-break=true"]);
    case "pageNumber":
      throw new Error("<Stego.PageNumber /> may only appear inside <Stego.PageTemplate /> in V1.");
    case "text":
      return escapeInlineText(node.value);
    case "span":
      return renderSpan(node, context);
    case "link":
      return renderLink(node, context);
    default:
      return assertNever(node);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected node kind: ${String(value)}`);
}

type RenderContext = {
  presentationMarkerIndex: number;
  inlineStyleIndex: number;
  blockMarkers: PresentationBlockMarker[];
  inlineStyles: PresentationInlineStyleSpec[];
  inlineStyleIds: Map<string, string>;
  usesBlockFontFamily: boolean;
  usesBlockLineSpacing: boolean;
  usesUnderline: boolean;
  usesTextColor: boolean;
  defaultParagraphSpaceBefore?: string;
  defaultParagraphSpaceAfter?: string;
  leaves: Map<string, LeafIndexEntry>;
};

function renderMarkdownNode(node: Extract<StegoNode, { kind: "markdown" }>): string {
  if (node.leaf) {
    const anchor = buildLeafRootAnchor(node.leaf.id);
    const body = injectLeafHeadingAnchors(node.leaf.body.trim(), node.leaf.id);
    return `::: {#${anchor} data-leaf-id=${node.leaf.id}}\n${body}\n:::`;
  }
  return (node.source || "").trim();
}

function renderPlainTextNode(node: Extract<StegoNode, { kind: "plainText" }>): string {
  const source = node.leaf ? node.leaf.body : (node.source || "");
  const body = source
    .trim()
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim().split(/\r?\n/).join(" "))
    .filter(Boolean)
    .join("\n\n");
  if (node.leaf) {
    const anchor = buildLeafRootAnchor(node.leaf.id);
    return `::: {#${anchor} data-leaf-id=${node.leaf.id}}\n${body}\n:::`;
  }
  return body;
}

function renderMarkdownHeadingNode(
  node: Extract<StegoNode, { kind: "markdownHeading" }>,
): string {
  if (!node.anchorId) {
    return node.source;
  }

  return applyHeadingAnchorToSource(node.source, node.anchorId);
}

function renderInlineChildren(children: StegoInlineNode[], context: RenderContext): string {
  return children.map((child) => renderInlineNode(child, context)).join("");
}

function renderInlineNode(node: StegoInlineNode, context: RenderContext): string {
  if (node.kind === "text") {
    return escapeInlineText(node.value);
  }
  if (node.kind === "link") {
    return renderLink(node, context);
  }
  return renderSpan(node, context);
}

function renderLink(node: Extract<StegoInlineNode, { kind: "link" }>, context: RenderContext): string {
  const target = context.leaves.get(node.leaf);
  if (!target) {
    throw new Error(`Unknown leaf '${node.leaf}' referenced by <Stego.Link />.`);
  }

  let href = `#${buildLeafRootAnchor(target.id)}`;
  if (node.anchor) {
    href = `#${target.id}--${normalizeAnchor(node.anchor)}`;
  } else if (node.heading) {
    const resolved = findLeafHeadingTarget(target.headings, node.heading);
    if (resolved.ambiguous) {
      throw new Error(`Heading '${node.heading}' is ambiguous in leaf '${target.id}'. Use anchor= instead.`);
    }
    if (!resolved.target) {
      throw new Error(`Unknown heading '${node.heading}' in leaf '${target.id}'.`);
    }
    href = `#${resolved.target.anchor}`;
  }

  const label = node.children.length > 0
    ? renderInlineChildren(node.children, context)
    : escapeInlineText(resolveLeafLabel(target));
  return `[${label}](${href})`;
}

function renderSpan(node: StegoSpanNode, context: RenderContext): string {
  const body = renderInlineChildren(node.children, context);
  const style = toPresentationInlineStyle(node);
  if (!style) {
    return body;
  }

  trackInlineStyleUsage(context, style);
  const styleId = getOrCreateInlineStyle(context, style);
  const tokens = [`custom-style=${quoteAttrValue(styleId)}`];
  if (style.fontFamily) {
    tokens.push(`data-font-family=${quoteAttrValue(style.fontFamily)}`);
  }
  if (style.fontSizePt !== undefined) {
    tokens.push(`data-font-size=${formatFontSizeValue(`${style.fontSizePt}pt`)}`);
  }
  if (style.fontWeight !== undefined) {
    tokens.push(`data-font-weight=${style.fontWeight}`);
  }
  if (style.italic !== undefined) {
    tokens.push(`data-italic=${String(style.italic)}`);
  }
  if (style.underline !== undefined) {
    tokens.push(`data-underline=${String(style.underline)}`);
  }
  if (style.smallCaps !== undefined) {
    tokens.push(`data-small-caps=${String(style.smallCaps)}`);
  }
  if (style.color) {
    tokens.push(`data-color=${quoteAttrValue(style.color)}`);
  }
  return `[${body}]{${tokens.join(" ")}}`;
}

function resolveLeafLabel(target: LeafIndexEntry): string {
  const label = typeof target.metadata.label === "string" && target.metadata.label.trim()
    ? target.metadata.label.trim()
    : typeof target.metadata.title === "string" && target.metadata.title.trim()
      ? target.metadata.title.trim()
      : target.titleFromFilename.trim() || target.id;
  return label;
}

function normalizeAnchor(value: string): string {
  return value.trim().replace(/^#/, "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

function normalizeParagraphSpacingForDefaults(
  input: {
    spaceBefore?: SpacingValue;
    spaceAfter?: SpacingValue;
  },
  context: RenderContext,
): {
  spaceBefore?: SpacingValue;
  spaceAfter?: SpacingValue;
} {
  const before = formatSpacingValue(input.spaceBefore);
  const after = formatSpacingValue(input.spaceAfter);

  return {
    spaceBefore: before === context.defaultParagraphSpaceBefore ? undefined : input.spaceBefore,
    spaceAfter: after === context.defaultParagraphSpaceAfter ? undefined : input.spaceAfter
  };
}

function applyHeadingAnchorToSource(source: string, anchorId: string): string {
  return source.replace(
    /^(\s*#{1,6}\s+)(.+?)\s*(?:\{#([^}]+)\})?\s*$/m,
    (_match, prefix: string, text: string) => `${prefix}${text.trim()} {#${anchorId}}`,
  );
}

function escapeInlineText(value: string): string {
  return value.replace(/([\[\]\\])/g, "\\$1");
}

function getOrCreatePresentationMarker(
  context: RenderContext,
  input: {
    markerId?: string;
    spaceBefore?: SpacingValue;
    spaceAfter?: SpacingValue;
    insetLeft?: InsetValue;
    insetRight?: InsetValue;
    firstLineIndent?: IndentValue;
    align?: AlignValue;
    fontFamily?: FontFamilyValue;
    fontSize?: FontSizeValue;
    lineSpacing?: LineSpacingValue;
    fontWeight?: FontWeightValue;
    italic?: boolean;
    underline?: boolean;
    smallCaps?: boolean;
    color?: ColorValue;
  }
): string | undefined {
  const layout = toPresentationBlockMarker(input);
  if (!layout) {
    return undefined;
  }
  const markerId = input.markerId || createPresentationMarkerId(++context.presentationMarkerIndex);
  context.blockMarkers.push({
    markerId,
    ...layout
  });
  trackBlockStyleUsage(context, layout);
  return markerId;
}

function trackBlockStyleUsage(
  context: RenderContext,
  layout: Omit<PresentationBlockMarker, "markerId">
): void {
  if (layout.fontFamily) {
    context.usesBlockFontFamily = true;
  }
  if (layout.lineSpacing !== undefined) {
    context.usesBlockLineSpacing = true;
  }
  if (layout.underline) {
    context.usesUnderline = true;
  }
  if (layout.color) {
    context.usesTextColor = true;
  }
}

function trackInlineStyleUsage(
  context: RenderContext,
  style: Omit<PresentationInlineStyleSpec, "styleId">,
): void {
  if (style.fontFamily) {
    context.usesBlockFontFamily = true;
  }
  if (style.underline) {
    context.usesUnderline = true;
  }
  if (style.color) {
    context.usesTextColor = true;
  }
}

function renderPresentationMarker(
  context: RenderContext,
  layout: Omit<PresentationBlockMarker, "markerId">,
  extraTokens: string[] = [],
  body = ""
): string {
  const markerId = createPresentationMarkerId(++context.presentationMarkerIndex);
  context.blockMarkers.push({
    markerId,
    ...layout
  });
  trackBlockStyleUsage(context, layout);
  const attrs = renderRawAttrs({ id: markerId, tokens: extraTokens });
  return body ? `::: ${attrs}\n${body}\n:::` : `::: ${attrs}\n:::`;
}

function toPresentationBlockMarker(input: {
  spaceBefore?: SpacingValue;
  spaceAfter?: SpacingValue;
  insetLeft?: InsetValue;
  insetRight?: InsetValue;
  firstLineIndent?: IndentValue;
  align?: AlignValue;
  fontFamily?: FontFamilyValue;
  fontSize?: FontSizeValue;
  lineSpacing?: LineSpacingValue;
  fontWeight?: FontWeightValue;
  italic?: boolean;
  underline?: boolean;
  smallCaps?: boolean;
  color?: ColorValue;
}): Omit<PresentationBlockMarker, "markerId"> | undefined {
  const spaceBefore = formatSpacingValue(input.spaceBefore);
  const spaceAfter = formatSpacingValue(input.spaceAfter);
  const insetLeft = formatSpacingValue(input.insetLeft);
  const insetRight = formatSpacingValue(input.insetRight);
  const firstLineIndent = formatIndentValue(input.firstLineIndent);
  const align = input.align;
  const fontFamily = formatFontFamilyValue(input.fontFamily);
  const fontSizePt = formatFontSizeInPoints(input.fontSize);
  const lineSpacing = formatLineSpacingValue(input.lineSpacing);
  const fontWeight = input.fontWeight;
  const italic = input.italic === true ? true : undefined;
  const underline = input.underline === true ? true : undefined;
  const smallCaps = input.smallCaps === true ? true : undefined;
  const color = normalizeHexColor(input.color);

  if (
    !spaceBefore
    && !spaceAfter
    && !insetLeft
    && !insetRight
    && !firstLineIndent
    && !align
    && !fontFamily
    && lineSpacing === undefined
    && fontSizePt === undefined
    && fontWeight === undefined
    && italic === undefined
    && underline === undefined
    && smallCaps === undefined
    && color === undefined
  ) {
    return undefined;
  }

  return {
    spaceBefore,
    spaceAfter,
    insetLeft,
    insetRight,
    firstLineIndent,
    align,
    fontFamily,
    fontSizePt,
    lineSpacing,
    fontWeight,
    italic,
    underline,
    smallCaps,
    color
  };
}

function toPresentationInlineStyle(input: {
  fontFamily?: FontFamilyValue;
  fontSize?: FontSizeValue;
  fontWeight?: FontWeightValue;
  italic?: boolean;
  underline?: boolean;
  smallCaps?: boolean;
  color?: ColorValue;
}): Omit<PresentationInlineStyleSpec, "styleId"> | undefined {
  const fontFamily = formatFontFamilyValue(input.fontFamily);
  const fontSizePt = formatFontSizeInPoints(input.fontSize);
  const fontWeight = input.fontWeight;
  const italic = input.italic;
  const underline = input.underline;
  const smallCaps = input.smallCaps;
  const color = normalizeHexColor(input.color);
  if (
    !fontFamily
    && fontSizePt === undefined
    && fontWeight === undefined
    && italic === undefined
    && underline === undefined
    && smallCaps === undefined
    && color === undefined
  ) {
    return undefined;
  }

  return {
    fontFamily,
    fontSizePt,
    fontWeight,
    italic,
    underline,
    smallCaps,
    color,
  };
}

function getOrCreateInlineStyle(
  context: RenderContext,
  style: Omit<PresentationInlineStyleSpec, "styleId">,
): string {
  const key = JSON.stringify(style);
  const existing = context.inlineStyleIds.get(key);
  if (existing) {
    return existing;
  }

  const styleId = `StegoSpan${++context.inlineStyleIndex}`;
  context.inlineStyleIds.set(key, styleId);
  context.inlineStyles.push({
    styleId,
    ...style,
  });
  return styleId;
}

function renderBlockAttrs(input: {
  id?: string;
  role?: string;
  spaceBefore?: SpacingValue;
  spaceAfter?: SpacingValue;
  insetLeft?: InsetValue;
  insetRight?: InsetValue;
  firstLineIndent?: IndentValue;
  align?: AlignValue;
  fontFamily?: FontFamilyValue;
  fontSize?: FontSizeValue;
  lineSpacing?: LineSpacingValue;
  fontWeight?: FontWeightValue;
  italic?: boolean;
  underline?: boolean;
  smallCaps?: boolean;
  color?: ColorValue;
}): string {
  const tokens: string[] = [];
  if (input.id) {
    tokens.push(`#${input.id}`);
  }
  if (input.role) {
    tokens.push(`data-role=${input.role}`);
  }
  const before = formatSpacingValue(input.spaceBefore);
  const after = formatSpacingValue(input.spaceAfter);
  const insetLeft = formatSpacingValue(input.insetLeft);
  const insetRight = formatSpacingValue(input.insetRight);
  const firstLineIndent = formatIndentValue(input.firstLineIndent);
  if (before) {
    tokens.push(`data-space-before=${before}`);
  }
  if (after) {
    tokens.push(`data-space-after=${after}`);
  }
  if (insetLeft) {
    tokens.push(`data-inset-left=${insetLeft}`);
  }
  if (insetRight) {
    tokens.push(`data-inset-right=${insetRight}`);
  }
  if (firstLineIndent) {
    tokens.push(`data-first-line-indent=${firstLineIndent}`);
  }
  if (input.align) {
    tokens.push(`data-align=${String(input.align)}`);
  }
  const fontFamily = formatFontFamilyValue(input.fontFamily);
  const fontSize = formatFontSizeValue(input.fontSize);
  const lineSpacing = formatLineSpacingValue(input.lineSpacing);
  const color = normalizeHexColor(input.color);
  if (fontFamily) {
    tokens.push(`data-font-family=${quoteAttrValue(fontFamily)}`);
  }
  if (fontSize) {
    tokens.push(`data-font-size=${fontSize}`);
  }
  if (lineSpacing !== undefined) {
    tokens.push(`data-line-spacing=${String(lineSpacing)}`);
  }
  if (input.fontWeight) {
    tokens.push(`data-font-weight=${input.fontWeight}`);
  }
  if (input.italic === true) {
    tokens.push(`data-italic=true`);
  }
  if (input.underline === true) {
    tokens.push(`data-underline=true`);
  }
  if (input.smallCaps === true) {
    tokens.push(`data-small-caps=true`);
  }
  if (color) {
    tokens.push(`data-color=${quoteAttrValue(color)}`);
  }
  return tokens.length > 0 ? `{${tokens.join(" ")}}` : "";
}

function renderRawAttrs(input: { id?: string; tokens?: string[] }): string {
  const tokens: string[] = [];
  if (input.id) {
    tokens.push(`#${input.id}`);
  }
  if (input.tokens && input.tokens.length > 0) {
    tokens.push(...input.tokens);
  }
  return tokens.length > 0 ? `{${tokens.join(" ")}}` : "";
}

function formatIndentValue(value: IndentValue | undefined): string | undefined {
  if (value == null) {
    return undefined;
  }
  return typeof value === "number" ? `${value}pt` : value;
}

function formatFontFamilyValue(value: FontFamilyValue | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function formatFontSizeValue(value: FontSizeValue | undefined): string | undefined {
  if (value == null) {
    return undefined;
  }
  return typeof value === "number" ? `${value}pt` : value.trim();
}

function formatFontSizeInPoints(value: FontSizeValue | undefined): number | undefined {
  const normalized = formatFontSizeValue(value);
  if (!normalized) {
    return undefined;
  }
  const match = normalized.match(/^(-?\d+(?:\.\d+)?)pt$/);
  if (!match) {
    return undefined;
  }
  const amount = Number(match[1]);
  return Number.isFinite(amount) ? amount : undefined;
}

function formatLineSpacingValue(value: LineSpacingValue | undefined): number | undefined {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return value;
}

function quoteAttrValue(value: string): string {
  return JSON.stringify(value);
}

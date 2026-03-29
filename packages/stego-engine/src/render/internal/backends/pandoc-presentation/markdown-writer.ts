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
  PageRegionSpec,
  SpacingValue,
  StegoInlineNode,
  StegoSpanNode,
  StegoNode
} from "../../../../ir/index.ts";
import type {
  PresentationBlockMarker,
  PresentationInlineStyleSpec,
  PresentationPageRegion,
  PresentationPageRegionNode,
  PresentationPageTemplateSegment,
} from "../../../public/types.ts";
import { normalizeHexColor } from "../../../../style/index.ts";
import type { LeafRecord } from "../../../../template/index.ts";
import { formatSizeValue, formatSpacingValue } from "../../normalize/index.ts";

type LeafIndexEntry = {
  id: string;
  titleFromFilename: string;
  metadata: Record<string, unknown>;
  headings: LeafHeadingTarget[];
};

type PageTemplateSegmentInput = {
  nodes: StegoNode[];
  header?: PageRegionSpec;
  footer?: PageRegionSpec;
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
  pageTemplates: PresentationPageTemplateSegment[];
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

  const hasScopedPageTemplates = containsTopLevelPageTemplate(nodes);
  if (!hasScopedPageTemplates) {
    for (const node of nodes) {
      const rendered = renderNode(node, context);
      if (!rendered) {
        continue;
      }
      blocks.push(rendered);
    }

    return {
      markdown: `${blocks.join("\n\n").replace(/\n{3,}/g, "\n\n")}\n`,
      pageTemplates: [],
      blockMarkers: context.blockMarkers,
      inlineStyles: context.inlineStyles,
      usesBlockFontFamily: context.usesBlockFontFamily,
      usesBlockLineSpacing: context.usesBlockLineSpacing,
      usesUnderline: context.usesUnderline,
      usesTextColor: context.usesTextColor
    };
  }

  const pageTemplates: PresentationPageTemplateSegment[] = [];
  for (const segment of splitTopLevelPageTemplateSegments(nodes)) {
    const body = segment.nodes
      .map((node) => renderNode(node, context))
      .filter(Boolean)
      .join("\n\n");
    if (!body) {
      continue;
    }
    const markerId = createPresentationMarkerId(++context.presentationMarkerIndex);
    const templateId = segment.header || segment.footer ? markerId : "none";
    const attrs = renderRawAttrs({
      id: markerId,
      tokens: [`data-page-template=${quoteAttrValue(templateId)}`],
    });
    blocks.push(`::: ${attrs}\n${body}\n:::`);
    pageTemplates.push({
      markerId,
      header: lowerPageRegion(segment.header),
      footer: lowerPageRegion(segment.footer),
    });
  }

  return {
    markdown: `${blocks.join("\n\n").replace(/\n{3,}/g, "\n\n")}\n`,
    pageTemplates,
    blockMarkers: context.blockMarkers,
    inlineStyles: context.inlineStyles,
    usesBlockFontFamily: context.usesBlockFontFamily,
    usesBlockLineSpacing: context.usesBlockLineSpacing,
    usesUnderline: context.usesUnderline,
    usesTextColor: context.usesTextColor
  };
}

function containsTopLevelPageTemplate(nodes: StegoNode[]): boolean {
  for (const node of nodes) {
    if (node.kind === "pageTemplate") {
      return true;
    }
    if (node.kind === "fragment" && containsTopLevelPageTemplate(node.children)) {
      return true;
    }
  }
  return false;
}

function splitTopLevelPageTemplateSegments(nodes: StegoNode[]): PageTemplateSegmentInput[] {
  const segments: PageTemplateSegmentInput[] = [];
  let pendingDefault: StegoNode[] = [];

  const pushNode = (node: StegoNode) => {
    if (node.kind === "fragment") {
      for (const child of node.children) {
        pushNode(child);
      }
      return;
    }
    if (node.kind === "pageTemplate") {
      if (pendingDefault.length > 0) {
        segments.push({ nodes: pendingDefault });
        pendingDefault = [];
      }
      if (node.children.length > 0) {
        segments.push({
          nodes: node.children,
          header: node.header,
          footer: node.footer,
        });
      }
      return;
    }
    pendingDefault.push(node);
  };

  for (const node of nodes) {
    pushNode(node);
  }

  if (pendingDefault.length > 0) {
    segments.push({ nodes: pendingDefault });
  }

  return segments;
}

function lowerPageRegion(region: PageRegionSpec | undefined): PresentationPageRegion | undefined {
  if (!region) {
    return undefined;
  }

  const lowered: PresentationPageRegion = {
    left: lowerPageRegionNodes(region.left),
    center: lowerPageRegionNodes(region.center),
    right: lowerPageRegionNodes(region.right),
  };

  return lowered.left || lowered.center || lowered.right ? lowered : undefined;
}

function lowerPageRegionNodes(nodes: PageRegionSpec["left"]): PresentationPageRegionNode[] | undefined {
  if (!nodes || nodes.length === 0) {
    return undefined;
  }

  return nodes.map((node) => {
    if (node.kind === "text") {
      return { kind: "text", value: node.value };
    }
    if (node.kind === "pageNumber") {
      return { kind: "pageNumber" };
    }
    return {
      kind: "span",
      fontFamily: formatFontFamilyValue(node.fontFamily),
      fontSizePt: formatFontSizeInPoints(node.fontSize),
      fontWeight: node.fontWeight,
      italic: node.italic,
      underline: node.underline,
      smallCaps: node.smallCaps,
      color: normalizeHexColor(node.color),
      children: lowerPageRegionNodes(node.children as PageRegionSpec["left"]) || [],
    };
  });
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
      const source = replaceStegoMarkdownInlineDirectives(node.source, context);
      return attrs ? `::: ${attrs}\n${source}\n:::` : source;
    }
    case "markdownHeading": {
      const body = renderMarkdownHeadingNode(node, context);
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
      return replaceStegoMarkdownInlineDirectives(node.source, context);
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
  context: RenderContext,
): string {
  const source = replaceStegoMarkdownInlineDirectives(node.source, context);
  if (!node.anchorId) {
    return source;
  }

  return applyHeadingAnchorToSource(source, node.anchorId);
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
  return renderStyledInline(body, style, context);
}

function renderStyledInline(
  body: string,
  style: Omit<PresentationInlineStyleSpec, "styleId"> | undefined,
  context: RenderContext,
): string {
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

function replaceStegoMarkdownInlineDirectives(source: string, context: RenderContext): string {
  if (!/<\s*\/?\s*stego-/i.test(source)) {
    return source;
  }

  let output = "";
  let cursor = 0;
  while (cursor < source.length) {
    const relativeIndex = source.slice(cursor).search(/<\s*\/?\s*stego-/i);
    if (relativeIndex < 0) {
      output += source.slice(cursor);
      break;
    }

    const startIndex = cursor + relativeIndex;
    output += source.slice(cursor, startIndex);
    const tag = readStegoInlineTag(source, startIndex);

    if (tag.closing) {
      throw new Error(`Unexpected closing markdown directive '</${tag.name}>'.`);
    }
    if (tag.selfClosing) {
      if (tag.name === "stego-spacer") {
        throw new Error("<stego-spacer /> is only supported as a standalone block directive.");
      }
      if (tag.name === "stego-span") {
        throw new Error("<stego-span> requires paired syntax in V1.");
      }
      throw new Error(`Unsupported markdown directive '<${tag.name} />'. Supported directives: stego-spacer, stego-span.`);
    }
    if (tag.name !== "stego-span") {
      throw new Error(`Unsupported markdown directive '<${tag.name}>'. Supported directives: stego-spacer, stego-span.`);
    }

    const closeStart = findMatchingStegoSpanClose(source, tag.endIndex);
    if (closeStart < 0) {
      throw new Error("<stego-span> must be closed with </stego-span>.");
    }

    const closeTag = readStegoInlineTag(source, closeStart);
    const inner = source.slice(tag.endIndex, closeStart);
    output += renderStyledInline(
      replaceStegoMarkdownInlineDirectives(inner, context),
      parseStegoSpanStyle(tag.attributes),
      context,
    );
    cursor = closeTag.endIndex;
  }

  return output;
}

function findMatchingStegoSpanClose(source: string, fromIndex: number): number {
  let depth = 1;
  let cursor = fromIndex;

  while (cursor < source.length) {
    const relativeIndex = source.slice(cursor).search(/<\s*\/?\s*stego-/i);
    if (relativeIndex < 0) {
      return -1;
    }

    const startIndex = cursor + relativeIndex;
    const tag = readStegoInlineTag(source, startIndex);
    cursor = tag.endIndex;

    if (tag.name !== "stego-span") {
      if (tag.selfClosing && tag.name === "stego-spacer") {
        throw new Error("<stego-spacer /> is only supported as a standalone block directive.");
      }
      if (tag.selfClosing) {
        throw new Error(`Unsupported markdown directive '<${tag.name} />'. Supported directives: stego-spacer, stego-span.`);
      }
      if (tag.closing) {
        throw new Error(`Unexpected closing markdown directive '</${tag.name}>'.`);
      }
      throw new Error(`Unsupported markdown directive '<${tag.name}>'. Supported directives: stego-spacer, stego-span.`);
    }

    if (tag.closing) {
      depth -= 1;
      if (depth === 0) {
        return startIndex;
      }
      continue;
    }

    if (tag.selfClosing) {
      throw new Error("<stego-span> requires paired syntax in V1.");
    }

    depth += 1;
  }

  return -1;
}

function readStegoInlineTag(source: string, startIndex: number): {
  name: string;
  attributes: Record<string, string>;
  closing: boolean;
  selfClosing: boolean;
  endIndex: number;
} {
  let index = startIndex + 1;
  while (source[index] && /\s/.test(source[index])) {
    index += 1;
  }

  let closing = false;
  if (source[index] === "/") {
    closing = true;
    index += 1;
    while (source[index] && /\s/.test(source[index])) {
      index += 1;
    }
  }

  const nameStart = index;
  while (source[index] && /[A-Za-z0-9-]/.test(source[index])) {
    index += 1;
  }
  const name = source.slice(nameStart, index).toLowerCase();

  let inQuote = false;
  let endIndex = index;
  while (endIndex < source.length) {
    const char = source[endIndex];
    if (char === "\"") {
      inQuote = !inQuote;
    } else if (char === ">" && !inQuote) {
      endIndex += 1;
      break;
    }
    endIndex += 1;
  }

  const rawTag = source.slice(startIndex, endIndex);
  const selfClosing = /\/\s*>$/.test(rawTag);
  const attributeSource = rawTag
    .replace(/^<\s*\/?\s*[A-Za-z0-9-]+\s*/u, "")
    .replace(/\/?\s*>$/u, "")
    .trim();

  return {
    name,
    attributes: parseStegoInlineAttributes(attributeSource, rawTag),
    closing,
    selfClosing,
    endIndex,
  };
}

function parseStegoInlineAttributes(rawAttributes: string, source: string): Record<string, string> {
  if (!rawAttributes) {
    return {};
  }

  const attributes: Record<string, string> = {};
  const attributePattern = /\s*([a-zA-Z_:][a-zA-Z0-9:._-]*)(?:\s*=\s*"([^"]*)")?\s*/g;
  let cursor = 0;

  while (cursor < rawAttributes.length) {
    attributePattern.lastIndex = cursor;
    const match = attributePattern.exec(rawAttributes);
    if (!match || match.index !== cursor) {
      throw new Error(`Invalid markdown directive syntax '${source}'. Attributes must use quoted HTML-style values.`);
    }

    const [, name, value] = match;
    attributes[name] = value ?? "";
    cursor = attributePattern.lastIndex;
  }

  return attributes;
}

function parseStegoSpanStyle(
  attributes: Record<string, string>,
): Omit<PresentationInlineStyleSpec, "styleId"> | undefined {
  const allowed = new Set([
    "font-family",
    "fontFamily",
    "font-size",
    "fontSize",
    "font-weight",
    "fontWeight",
    "italic",
    "underline",
    "small-caps",
    "smallCaps",
    "color",
  ]);
  const unsupported = Object.keys(attributes).filter((name) => !allowed.has(name));
  if (unsupported.length > 0) {
    throw new Error("Unsupported attributes on stego-span. Supported attributes: font-family, font-size, font-weight, italic, underline, small-caps, color.");
  }

  const fontWeight = coalesceAttribute(attributes, "font-weight", "fontWeight");
  if (fontWeight !== undefined && fontWeight !== "normal" && fontWeight !== "bold") {
    throw new Error(`Invalid stego-span font-weight value '${fontWeight}'. Expected 'normal' or 'bold'.`);
  }

  const italic = parseStegoSpanBooleanAttribute(attributes, "italic");
  const underline = parseStegoSpanBooleanAttribute(attributes, "underline");
  const smallCaps = parseStegoSpanBooleanAttribute(attributes, "small-caps", "smallCaps");
  const color = coalesceAttribute(attributes, "color");
  if (color !== undefined && !normalizeHexColor(color)) {
    throw new Error(`Invalid stego-span color value '${color}'. Expected a hex color like '#666666'.`);
  }

  const fontSize = coalesceAttribute(attributes, "font-size", "fontSize");
  if (fontSize !== undefined && formatFontSizeInPoints(fontSize as FontSizeValue) === undefined) {
    throw new Error(`Invalid stego-span font-size value '${fontSize}'. Expected a pt value like '12pt'.`);
  }

  return toPresentationInlineStyle({
    fontFamily: coalesceAttribute(attributes, "font-family", "fontFamily"),
    fontSize: fontSize as FontSizeValue | undefined,
    fontWeight: fontWeight as FontWeightValue | undefined,
    italic,
    underline,
    smallCaps,
    color: color as ColorValue | undefined,
  });
}

function parseStegoSpanBooleanAttribute(
  attributes: Record<string, string>,
  ...names: string[]
): boolean | undefined {
  const value = coalesceAttribute(attributes, ...names);
  if (value === undefined) {
    return undefined;
  }
  if (value === "") {
    return true;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new Error(`Invalid stego-span ${names[0]} value '${value}'. Expected 'true' or 'false'.`);
}

function coalesceAttribute(attributes: Record<string, string>, ...names: string[]): string | undefined {
  for (const name of names) {
    if (attributes[name] !== undefined) {
      return attributes[name];
    }
  }
  return undefined;
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

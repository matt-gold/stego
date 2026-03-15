import {
  buildLeafRootAnchor,
  findLeafHeadingTarget,
  injectLeafHeadingAnchors,
  type LeafHeadingTarget
} from "@stego-labs/shared/domain/content";
import { createDocxLayoutBookmarkName, type DocxBlockLayoutSpec } from "@stego-labs/shared/domain/layout";
import type {
  AlignValue,
  IndentValue,
  InsetValue,
  SpacingValue,
  StegoInlineNode,
  StegoNode
} from "../../../../ir/index.ts";
import type { LeafRecord } from "../../../../template/index.ts";
import { formatSizeValue, formatSpacingValue } from "../../normalize/index.ts";

type LeafIndexEntry = {
  id: string;
  titleFromFilename: string;
  metadata: Record<string, unknown>;
  headings: LeafHeadingTarget[];
};

export function writePandocMarkdown(nodes: StegoNode[], leaves: LeafRecord[]): {
  markdown: string;
  docxBlockLayouts: DocxBlockLayoutSpec[];
} {
  const blocks: string[] = [];
  const context = {
    docxBlockLayoutIndex: 0,
    docxBlockLayouts: [] as DocxBlockLayoutSpec[],
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
    docxBlockLayouts: context.docxBlockLayouts
  };
}

function renderNode(node: StegoNode, context: RenderContext): string {
  switch (node.kind) {
    case "document":
    case "fragment":
      return node.children.map((child) => renderNode(child, context)).filter(Boolean).join("\n\n");
    case "keepTogether": {
      const markerId = createDocxLayoutBookmarkName(++context.docxBlockLayoutIndex);
      context.docxBlockLayouts.push({
        bookmarkName: markerId,
        keepTogether: true
      });
      const body = node.children.map((child) => renderNode(child, context)).filter(Boolean).join("\n\n");
      return `::: {#${markerId} data-keep-together=true}\n${body}\n:::`;
    }
    case "pageTemplate":
      return "";
    case "section": {
      const body = node.children.map((child) => renderNode(child, context)).filter(Boolean).join("\n\n");
      const markerId = getOrCreateDocxBlockLayoutMarker(context, {
        bookmarkName: node.id,
        spaceBefore: node.spaceBefore,
        spaceAfter: node.spaceAfter,
        insetLeft: node.insetLeft,
        insetRight: node.insetRight,
        firstLineIndent: node.firstLineIndent,
        align: node.align
      });
      const attrs = renderBlockAttrs({
        id: markerId || node.id,
        role: node.role,
        spaceBefore: node.spaceBefore,
        spaceAfter: node.spaceAfter,
        insetLeft: node.insetLeft,
        insetRight: node.insetRight,
        firstLineIndent: node.firstLineIndent,
        align: node.align
      });
      return attrs ? `::: ${attrs}\n${body}\n:::` : body;
    }
    case "heading": {
      const layout = toDocxBlockLayout({
        spaceBefore: node.spaceBefore,
        spaceAfter: node.spaceAfter,
        insetLeft: node.insetLeft,
        insetRight: node.insetRight,
        align: node.align
      });
      const body = `${"#".repeat(node.level)} ${renderInlineChildren(node.children, context)}`;
      if (!layout) {
        return body;
      }
      const markerId = createDocxLayoutBookmarkName(++context.docxBlockLayoutIndex);
      context.docxBlockLayouts.push({
        bookmarkName: markerId,
        ...layout
      });
      const attrs = renderBlockAttrs({
        id: markerId,
        spaceBefore: node.spaceBefore,
        spaceAfter: node.spaceAfter,
        insetLeft: node.insetLeft,
        insetRight: node.insetRight,
        align: node.align
      });
      return `::: ${attrs}\n${body}\n:::`;
    }
    case "paragraph": {
      const markerId = getOrCreateDocxBlockLayoutMarker(context, {
        spaceBefore: node.spaceBefore,
        spaceAfter: node.spaceAfter,
        insetLeft: node.insetLeft,
        insetRight: node.insetRight,
        firstLineIndent: node.firstLineIndent,
        align: node.align
      });
      const attrs = renderBlockAttrs({
        id: markerId,
        spaceBefore: node.spaceBefore,
        spaceAfter: node.spaceAfter,
        insetLeft: node.insetLeft,
        insetRight: node.insetRight,
        firstLineIndent: node.firstLineIndent,
        align: node.align
      });
      const body = renderInlineChildren(node.children, context);
      return attrs ? `::: ${attrs}\n${body}\n:::` : body;
    }
    case "markdown":
      return renderMarkdownNode(node, context);
    case "plainText":
      return renderPlainTextNode(node, context);
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
      const markerId = createDocxLayoutBookmarkName(++context.docxBlockLayoutIndex);
      context.docxBlockLayouts.push({
        bookmarkName: markerId,
        align: node.align
      });
      return `::: {#${markerId}}\n${body}\n:::`;
    }
    case "pageBreak":
      return renderDocxLayoutMarker(context, { pageBreak: true }, ["data-page-break=true"]);
    case "pageNumber":
      throw new Error("<Stego.PageNumber /> may only appear inside <Stego.PageTemplate /> in V1.");
    case "text":
      return escapeInlineText(node.value);
    case "link":
      return renderLink(node, context);
  }
}

type RenderContext = {
  docxBlockLayoutIndex: number;
  docxBlockLayouts: DocxBlockLayoutSpec[];
  leaves: Map<string, LeafIndexEntry>;
};

function renderMarkdownNode(node: Extract<StegoNode, { kind: "markdown" }>, context: RenderContext): string {
  if (node.leaf) {
    const anchor = buildLeafRootAnchor(node.leaf.id);
    const body = injectLeafHeadingAnchors(node.leaf.body.trim(), node.leaf.id);
    return `::: {#${anchor} data-leaf-id=${node.leaf.id}}\n${body}\n:::`;
  }
  return (node.source || "").trim();
}

function renderPlainTextNode(node: Extract<StegoNode, { kind: "plainText" }>, context: RenderContext): string {
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

function renderInlineChildren(children: StegoInlineNode[], context: RenderContext): string {
  return children.map((child) => {
    if (child.kind === "text") {
      return escapeInlineText(child.value);
    }
    return renderLink(child, context);
  }).join("");
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

function escapeInlineText(value: string): string {
  return value.replace(/([\[\]\\])/g, "\\$1");
}

function getOrCreateDocxBlockLayoutMarker(
  context: RenderContext,
  input: {
    bookmarkName?: string;
    spaceBefore?: SpacingValue;
    spaceAfter?: SpacingValue;
    insetLeft?: InsetValue;
    insetRight?: InsetValue;
    firstLineIndent?: IndentValue;
    align?: AlignValue;
  }
): string | undefined {
  const layout = toDocxBlockLayout(input);
  if (!layout) {
    return undefined;
  }
  const bookmarkName = input.bookmarkName || createDocxLayoutBookmarkName(++context.docxBlockLayoutIndex);
  context.docxBlockLayouts.push({
    bookmarkName,
    ...layout
  });
  return bookmarkName;
}

function renderDocxLayoutMarker(
  context: RenderContext,
  layout: Omit<DocxBlockLayoutSpec, "bookmarkName">,
  extraTokens: string[] = [],
  body = ""
): string {
  const bookmarkName = createDocxLayoutBookmarkName(++context.docxBlockLayoutIndex);
  context.docxBlockLayouts.push({
    bookmarkName,
    ...layout
  });
  const attrs = renderRawAttrs({ id: bookmarkName, tokens: extraTokens });
  return body ? `::: ${attrs}\n${body}\n:::` : `::: ${attrs}\n:::`;
}

function toDocxBlockLayout(input: {
  spaceBefore?: SpacingValue;
  spaceAfter?: SpacingValue;
  insetLeft?: InsetValue;
  insetRight?: InsetValue;
  firstLineIndent?: IndentValue;
  align?: AlignValue;
}): Omit<DocxBlockLayoutSpec, "bookmarkName"> | undefined {
  const spaceBefore = formatSpacingValue(input.spaceBefore);
  const spaceAfter = formatSpacingValue(input.spaceAfter);
  const insetLeft = formatSpacingValue(input.insetLeft);
  const insetRight = formatSpacingValue(input.insetRight);
  const firstLineIndent = formatIndentValue(input.firstLineIndent);
  const align = input.align;

  if (!spaceBefore && !spaceAfter && !insetLeft && !insetRight && !firstLineIndent && !align) {
    return undefined;
  }

  return {
    spaceBefore,
    spaceAfter,
    insetLeft,
    insetRight,
    firstLineIndent,
    align
  };
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
  return `{${tokens.join(" ")}}`;
}

function formatIndentValue(value: IndentValue | undefined): string | undefined {
  if (value == null) {
    return undefined;
  }
  return typeof value === "number" ? `${value}pt` : value;
}

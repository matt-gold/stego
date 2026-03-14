import { createDocxLayoutBookmarkName, type DocxBlockLayoutSpec } from "@stego-labs/shared/domain/layout";
import type { AlignValue, IndentValue, InsetValue, SpacingValue, StegoNode } from "../../../../ir/index.ts";
import { formatSizeValue, formatSpacingValue } from "../../normalize/index.ts";

export function writePandocMarkdown(nodes: StegoNode[]): {
  markdown: string;
  docxBlockLayouts: DocxBlockLayoutSpec[];
} {
  const blocks: string[] = [];
  const context = {
    docxBlockLayoutIndex: 0,
    docxBlockLayouts: [] as DocxBlockLayoutSpec[]
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

function renderNode(node: StegoNode, context: {
  docxBlockLayoutIndex: number;
  docxBlockLayouts: DocxBlockLayoutSpec[];
}): string {
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
      const body = `${"#".repeat(node.level)} ${renderInlineChildren(node.children)}`;
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
      const body = renderInlineChildren(node.children);
      return attrs ? `::: ${attrs}\n${body}\n:::` : body;
    }
    case "markdown":
      return node.source.trim();
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
      return renderDocxLayoutMarker(context, {
        pageBreak: true
      }, ["data-page-break=true"]);
    case "pageNumber":
      throw new Error("<Stego.PageNumber /> may only appear inside <Stego.PageTemplate /> in V1.");
    case "text":
      return node.value;
  }
}

function renderInlineChildren(children: StegoNode[]): string {
  return children.map((child) => {
    if (child.kind !== "text") {
      throw new Error(`Only text children are supported inside this node in V1. Received '${child.kind}'.`);
    }
    return child.value;
  }).join("");
}

function getOrCreateDocxBlockLayoutMarker(context: {
  docxBlockLayoutIndex: number;
  docxBlockLayouts: DocxBlockLayoutSpec[];
}, input: {
  bookmarkName?: string;
  spaceBefore?: SpacingValue;
  spaceAfter?: SpacingValue;
  insetLeft?: InsetValue;
  insetRight?: InsetValue;
  firstLineIndent?: IndentValue;
  align?: AlignValue;
}): string | undefined {
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
  context: {
    docxBlockLayoutIndex: number;
    docxBlockLayouts: DocxBlockLayoutSpec[];
  },
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

import type { AlignValue, IndentValue, InsetValue, SpacingValue, StegoNode } from "../../../../ir/index.ts";
import { formatSizeValue, formatSpacingValue } from "../../normalize/index.ts";

export function writePandocMarkdown(nodes: StegoNode[]): string {
  const blocks: string[] = [];
  for (const node of nodes) {
    if (node.kind === "pageTemplate") {
      continue;
    }
    const rendered = renderNode(node);
    if (!rendered) {
      continue;
    }
    blocks.push(rendered);
  }
  return `${blocks.join("\n\n").replace(/\n{3,}/g, "\n\n")}\n`;
}

function renderNode(node: StegoNode): string {
  switch (node.kind) {
    case "document":
    case "fragment":
      return node.children.map(renderNode).filter(Boolean).join("\n\n");
    case "pageTemplate":
      return "";
    case "section": {
      const body = node.children.map(renderNode).filter(Boolean).join("\n\n");
      const attrs = renderBlockAttrs({
        id: node.id,
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
      const attrs = renderBlockAttrs({
        spaceBefore: node.spaceBefore,
        spaceAfter: node.spaceAfter,
        insetLeft: node.insetLeft,
        insetRight: node.insetRight,
        align: node.align
      });
      return `${"#".repeat(node.level)} ${renderInlineChildren(node.children)}${attrs ? ` ${attrs}` : ""}`;
    }
    case "paragraph": {
      const attrs = renderBlockAttrs({
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
      if (!node.caption) {
        return image;
      }
      return `${image}\n\n_${node.caption}_`;
    }
    case "pageBreak":
      return "\\newpage";
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

function formatIndentValue(value: IndentValue | undefined): string | undefined {
  if (value == null) {
    return undefined;
  }
  return typeof value === "number" ? `${value}pt` : value;
}

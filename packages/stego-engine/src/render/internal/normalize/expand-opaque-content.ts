import MarkdownIt from "markdown-it";
import { buildLeafRootAnchor } from "@stego-labs/shared/domain/content";
import {
  createDocumentNode,
  createFragmentNode,
  createHeadingNode,
  createKeepTogetherNode,
  createMarkdownBlockNode,
  createMarkdownHeadingNode,
  createMarkdownParagraphNode,
  createParagraphNode,
  createSectionNode,
  type FontFamilyValue,
  type FontSizeValue,
  type LineSpacingValue,
  type SpacingValue,
  type StegoDocumentNode,
  type StegoMarkdownNode,
  type StegoNode,
  type StegoPlainTextNode,
} from "../../../ir/index.ts";
import type { TemplateContext } from "../../../template/index.ts";

type MarkdownToken = ReturnType<MarkdownIt["parse"]>[number];

type ParagraphDefaults = {
  parSpaceBefore: SpacingValue | 0;
  parSpaceAfter: SpacingValue | 0;
};

type TypographyDefaults = {
  fontFamily?: FontFamilyValue;
  fontSize?: FontSizeValue;
  lineSpacing?: LineSpacingValue;
};

const markdownParser = new MarkdownIt({
  html: true,
});

export function expandOpaqueContentNodes(
  document: StegoDocumentNode,
  context: TemplateContext,
): StegoDocumentNode {
  const paragraphDefaults: ParagraphDefaults = {
    parSpaceBefore: document.parSpaceBefore ?? 0,
    parSpaceAfter: document.parSpaceAfter ?? 0,
  };
  const typographyDefaults: TypographyDefaults = {
    fontFamily: document.fontFamily,
    fontSize: document.fontSize,
    lineSpacing: document.lineSpacing,
  };

  return createDocumentNode(
    document.page,
    expandChildren(document.children, context, paragraphDefaults, typographyDefaults),
    {
      fontFamily: typographyDefaults.fontFamily,
      fontSize: typographyDefaults.fontSize,
      lineSpacing: typographyDefaults.lineSpacing,
      parSpaceBefore: paragraphDefaults.parSpaceBefore,
      parSpaceAfter: paragraphDefaults.parSpaceAfter,
    },
  );
}

function expandChildren(
  nodes: StegoNode[],
  context: TemplateContext,
  paragraphDefaults: ParagraphDefaults,
  typographyDefaults: TypographyDefaults,
): StegoNode[] {
  const expanded: StegoNode[] = [];
  for (const node of nodes) {
    expanded.push(...expandNode(node, context, paragraphDefaults, typographyDefaults));
  }
  return expanded;
}

function expandNode(
  node: StegoNode,
  context: TemplateContext,
  paragraphDefaults: ParagraphDefaults,
  typographyDefaults: TypographyDefaults,
): StegoNode[] {
  switch (node.kind) {
    case "document":
      return [expandOpaqueContentNodes(node, context)];
    case "fragment":
      return [createFragmentNode(expandChildren(node.children, context, paragraphDefaults, typographyDefaults))];
    case "keepTogether":
      return [createKeepTogetherNode(expandChildren(node.children, context, paragraphDefaults, typographyDefaults))];
    case "section": {
      const nextDefaults: ParagraphDefaults = {
        parSpaceBefore: node.parSpaceBefore ?? paragraphDefaults.parSpaceBefore,
        parSpaceAfter: node.parSpaceAfter ?? paragraphDefaults.parSpaceAfter,
      };
      const nextTypographyDefaults: TypographyDefaults = {
        fontFamily: node.fontFamily ?? typographyDefaults.fontFamily,
        fontSize: node.fontSize ?? typographyDefaults.fontSize,
        lineSpacing: node.lineSpacing ?? typographyDefaults.lineSpacing,
      };
      return [
        createSectionNode(
          {
            role: node.role,
            id: node.id,
            spaceBefore: node.spaceBefore,
            spaceAfter: node.spaceAfter,
            parSpaceBefore: node.parSpaceBefore,
            parSpaceAfter: node.parSpaceAfter,
            insetLeft: node.insetLeft,
            insetRight: node.insetRight,
            firstLineIndent: node.firstLineIndent,
            align: node.align,
            fontFamily: node.fontFamily,
            fontSize: node.fontSize,
            lineSpacing: node.lineSpacing,
          },
          expandChildren(node.children, context, nextDefaults, nextTypographyDefaults),
        ),
      ];
    }
    case "heading":
      return [
        createHeadingNode(
          node.level,
          {
            spaceBefore: node.spaceBefore,
            spaceAfter: node.spaceAfter,
            insetLeft: node.insetLeft,
            insetRight: node.insetRight,
            align: node.align,
            fontFamily: node.fontFamily ?? typographyDefaults.fontFamily,
            fontSize: node.fontSize,
            lineSpacing: node.lineSpacing,
          },
          node.children,
        ),
      ];
    case "paragraph":
      return [
        createParagraphNode(
          {
            spaceBefore: node.spaceBefore ?? paragraphDefaults.parSpaceBefore,
            spaceAfter: node.spaceAfter ?? paragraphDefaults.parSpaceAfter,
            insetLeft: node.insetLeft,
            insetRight: node.insetRight,
            firstLineIndent: node.firstLineIndent,
            align: node.align,
            fontFamily: node.fontFamily ?? typographyDefaults.fontFamily,
            fontSize: node.fontSize ?? typographyDefaults.fontSize,
            lineSpacing: node.lineSpacing ?? typographyDefaults.lineSpacing,
          },
          node.children,
        ),
      ];
    case "markdown":
      return expandMarkdownNode(node, context, paragraphDefaults, typographyDefaults);
    case "plainText":
      return expandPlainTextNode(node, paragraphDefaults, typographyDefaults);
    case "markdownParagraph":
      return [
        createMarkdownParagraphNode(node.source, {
          spaceBefore: node.spaceBefore ?? paragraphDefaults.parSpaceBefore,
          spaceAfter: node.spaceAfter ?? paragraphDefaults.parSpaceAfter,
          fontFamily: node.fontFamily ?? typographyDefaults.fontFamily,
          fontSize: node.fontSize ?? typographyDefaults.fontSize,
          lineSpacing: node.lineSpacing ?? typographyDefaults.lineSpacing,
        }),
      ];
    case "markdownHeading":
      return [
        createMarkdownHeadingNode(node.level, node.source, node.anchorId, {
          fontFamily: node.fontFamily ?? typographyDefaults.fontFamily,
          fontSize: node.fontSize,
          lineSpacing: node.lineSpacing,
        }),
      ];
    case "markdownBlock":
    case "image":
    case "pageBreak":
    case "pageTemplate":
    case "pageNumber":
    case "text":
    case "link":
      return [node];
    default:
      return assertNever(node);
  }
}

function expandMarkdownNode(
  node: StegoMarkdownNode,
  context: TemplateContext,
  paragraphDefaults: ParagraphDefaults,
  typographyDefaults: TypographyDefaults,
): StegoNode[] {
  const source = node.leaf?.body ?? node.source ?? "";
  const blocks = splitMarkdownIntoBlocks(source, resolveLeafHeadings(node, context), paragraphDefaults, typographyDefaults);
  if (!node.leaf) {
    return blocks;
  }
  return [createSectionNode({ id: buildLeafRootAnchor(node.leaf.id) }, blocks)];
}

function expandPlainTextNode(
  node: StegoPlainTextNode,
  paragraphDefaults: ParagraphDefaults,
  typographyDefaults: TypographyDefaults,
): StegoNode[] {
  const source = node.leaf?.body ?? node.source ?? "";
  const paragraphs = source
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim().split(/\r?\n/).join(" "))
    .filter(Boolean)
    .map((paragraph) =>
      createParagraphNode(
        {
          spaceBefore: paragraphDefaults.parSpaceBefore,
          spaceAfter: paragraphDefaults.parSpaceAfter,
          fontFamily: typographyDefaults.fontFamily,
          fontSize: typographyDefaults.fontSize,
          lineSpacing: typographyDefaults.lineSpacing,
        },
        [{ kind: "text", value: paragraph }],
      )
    );

  if (!node.leaf) {
    return paragraphs;
  }

  return [createSectionNode({ id: buildLeafRootAnchor(node.leaf.id) }, paragraphs)];
}

function splitMarkdownIntoBlocks(
  source: string,
  headings: Map<number, string>,
  paragraphDefaults: ParagraphDefaults,
  typographyDefaults: TypographyDefaults,
): StegoNode[] {
  if (!source.trim()) {
    return [];
  }

  const lines = source.split(/\r?\n/);
  const tokens = markdownParser.parse(source, {});
  const blocks: StegoNode[] = [];

  for (let index = 0; index < tokens.length;) {
    const token = tokens[index];
    if (token.level !== 0) {
      index += 1;
      continue;
    }

    if (token.type === "paragraph_open") {
      const closeIndex = findMatchingClose(tokens, index);
      const map = token.map || tokens[index + 1]?.map;
      const paragraphSource = sliceSourceByMap(lines, map);
      if (paragraphSource) {
        blocks.push(
          createMarkdownParagraphNode(paragraphSource, {
            spaceBefore: paragraphDefaults.parSpaceBefore,
            spaceAfter: paragraphDefaults.parSpaceAfter,
            fontFamily: typographyDefaults.fontFamily,
            fontSize: typographyDefaults.fontSize,
            lineSpacing: typographyDefaults.lineSpacing,
          }),
        );
      }
      index = closeIndex + 1;
      continue;
    }

    if (token.type === "heading_open") {
      const closeIndex = findMatchingClose(tokens, index);
      const map = token.map || tokens[index + 1]?.map;
      const headingSource = sliceSourceByMap(lines, map);
      if (headingSource && isAtxHeadingSource(headingSource)) {
        const lineNumber = (map?.[0] ?? -1) + 1;
        const level = Number.parseInt(token.tag.slice(1), 10);
        blocks.push(
          createMarkdownHeadingNode(
            Number.isFinite(level) ? (level as 1 | 2 | 3 | 4 | 5 | 6) : 1,
            headingSource,
            headings.get(lineNumber),
            {
              fontFamily: typographyDefaults.fontFamily,
            }
          ),
        );
      } else if (headingSource) {
        blocks.push(createMarkdownBlockNode(headingSource));
      }
      index = closeIndex + 1;
      continue;
    }

    const endIndex = findOpaqueBlockEnd(tokens, index);
    const opaqueSource = sliceSourceByMap(lines, mergeTokenMaps(tokens.slice(index, endIndex + 1)));
    if (opaqueSource) {
      blocks.push(createMarkdownBlockNode(opaqueSource));
    }
    index = endIndex + 1;
  }

  return blocks;
}

function resolveLeafHeadings(
  node: StegoMarkdownNode,
  context: TemplateContext,
): Map<number, string> {
  if (!node.leaf) {
    return new Map<number, string>();
  }
  const leaf = context.allLeaves.find((entry) => entry.id === node.leaf?.id);
  return new Map((leaf?.headings || []).map((heading) => [heading.line, heading.anchor]));
}

function findMatchingClose(tokens: MarkdownToken[], openIndex: number): number {
  let depth = 0;
  for (let index = openIndex; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type.endsWith("_open")) {
      depth += 1;
    } else if (token.type.endsWith("_close")) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return openIndex;
}

function findOpaqueBlockEnd(tokens: MarkdownToken[], startIndex: number): number {
  const startToken = tokens[startIndex];
  if (startToken.nesting === 0) {
    return startIndex;
  }

  let depth = startToken.nesting;
  for (let index = startIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    depth += token.nesting;
    if (depth === 0) {
      return index;
    }
  }

  return startIndex;
}

function mergeTokenMaps(tokens: MarkdownToken[]): [number, number] | null {
  let start: number | null = null;
  let end: number | null = null;
  for (const token of tokens) {
    if (!token.map || token.map.length < 2) {
      continue;
    }
    start = start == null ? token.map[0] : Math.min(start, token.map[0]);
    end = end == null ? token.map[1] : Math.max(end, token.map[1]);
  }
  return start == null || end == null ? null : [start, end];
}

function sliceSourceByMap(lines: string[], map: readonly [number, number] | readonly number[] | null | undefined): string {
  if (!map || map.length < 2) {
    return "";
  }
  return lines.slice(map[0], map[1]).join("\n");
}

function isAtxHeadingSource(source: string): boolean {
  return /^\s*#{1,6}\s/.test(source);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled node kind during opaque expansion: ${(value as { kind?: string }).kind ?? "unknown"}`);
}

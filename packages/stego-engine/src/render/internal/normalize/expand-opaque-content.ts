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
  createSpacerNode,
  createSectionNode,
  type BodyStyle,
  type HeadingStyle,
  type HeadingStyleMap,
  type StegoDocumentNode,
  type StegoHeadingNode,
  type StegoMarkdownNode,
  type StegoNode,
  type StegoParagraphNode,
  type StegoPlainTextNode,
} from "../../../ir/index.ts";
import { mergeBodyStyle, mergeHeadingStyle, mergeHeadingStyleMap, resolveHeadingDefaults } from "../../../style/index.ts";
import type { TemplateContext } from "../../../template/index.ts";
import { parseStegoMarkdownDirective } from "./parse-stego-markdown-directive.ts";

type MarkdownToken = ReturnType<MarkdownIt["parse"]>[number];

type StyleDefaults = {
  bodyStyle?: BodyStyle;
  headingStyle?: HeadingStyle;
  headingStyles?: HeadingStyleMap;
};

const ROOT_BODY_STYLE: BodyStyle = {
  spaceBefore: 0,
  spaceAfter: 0,
};

const markdownParser = new MarkdownIt({
  html: true,
});

export function expandOpaqueContentNodes(
  document: StegoDocumentNode,
  context: TemplateContext,
): StegoDocumentNode {
  const defaults: StyleDefaults = {
    bodyStyle: mergeBodyStyle(ROOT_BODY_STYLE, document.bodyStyle),
    headingStyle: document.headingStyle,
    headingStyles: document.headingStyles,
  };

  return createDocumentNode(
    document.page,
    expandChildren(document.children, context, defaults),
    {
      bodyStyle: defaults.bodyStyle,
      headingStyle: document.headingStyle,
      headingStyles: document.headingStyles,
    },
  );
}

function expandChildren(
  nodes: StegoNode[],
  context: TemplateContext,
  defaults: StyleDefaults,
): StegoNode[] {
  const expanded: StegoNode[] = [];
  for (const node of nodes) {
    expanded.push(...expandNode(node, context, defaults));
  }
  return expanded;
}

function expandNode(
  node: StegoNode,
  context: TemplateContext,
  defaults: StyleDefaults,
): StegoNode[] {
  switch (node.kind) {
    case "document":
      return [expandOpaqueContentNodes(node, context)];
    case "fragment":
      return [createFragmentNode(expandChildren(node.children, context, defaults))];
    case "keepTogether":
      return [createKeepTogetherNode(expandChildren(node.children, context, defaults))];
    case "section": {
      const nextDefaults: StyleDefaults = {
        bodyStyle: mergeBodyStyle(defaults.bodyStyle, node.bodyStyle),
        headingStyle: mergeHeadingStyle(defaults.headingStyle, node.headingStyle),
        headingStyles: mergeHeadingStyleMap(defaults.headingStyles, node.headingStyles),
      };
      return [
        createSectionNode(
          {
            role: node.role,
            id: node.id,
            bodyStyle: node.bodyStyle,
            headingStyle: node.headingStyle,
            headingStyles: node.headingStyles,
          },
          expandChildren(node.children, context, nextDefaults),
        ),
      ];
    }
    case "heading":
      return [createResolvedHeadingNode(node, defaults)];
    case "paragraph":
      return [createResolvedParagraphNode(node, defaults.bodyStyle)];
    case "span":
      return [node];
    case "spacer":
      return [
        createSpacerNode(node.lines, {
          fontSize: node.fontSize ?? defaults.bodyStyle?.fontSize,
          lineSpacing: node.lineSpacing ?? defaults.bodyStyle?.lineSpacing,
        }),
      ];
    case "markdown":
      return expandMarkdownNode(node, context, defaults);
    case "plainText":
      return expandPlainTextNode(node, defaults.bodyStyle);
    case "markdownParagraph":
      return [
        createMarkdownParagraphNode(
          node.source,
          mergeBodyStyle(defaults.bodyStyle, {
            spaceBefore: node.spaceBefore,
            spaceAfter: node.spaceAfter,
            insetLeft: node.insetLeft,
            insetRight: node.insetRight,
            firstLineIndent: node.firstLineIndent,
            align: node.align,
            fontFamily: node.fontFamily,
            fontSize: node.fontSize,
            lineSpacing: node.lineSpacing,
          }) || {},
        ),
      ];
    case "markdownHeading":
      return [
        createResolvedMarkdownHeadingNode(
          node.level,
          node.source,
          node.anchorId,
          defaults,
          {
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
            color: node.color,
          },
        ),
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
  defaults: StyleDefaults,
): StegoNode[] {
  const source = node.leaf?.body ?? node.source ?? "";
  const blocks = splitMarkdownIntoBlocks(source, resolveLeafHeadings(node, context), defaults);
  if (!node.leaf) {
    return blocks;
  }
  return [createSectionNode({ id: buildLeafRootAnchor(node.leaf.id) }, blocks)];
}

function expandPlainTextNode(
  node: StegoPlainTextNode,
  bodyStyle: BodyStyle | undefined,
): StegoNode[] {
  const source = node.leaf?.body ?? node.source ?? "";
  const paragraphs = source
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim().split(/\r?\n/).join(" "))
    .filter(Boolean)
    .map((paragraph) =>
      createParagraphNode(
        bodyStyle || {},
        [{ kind: "text", value: paragraph }],
      ),
    );

  if (!node.leaf) {
    return paragraphs;
  }

  return [createSectionNode({ id: buildLeafRootAnchor(node.leaf.id) }, paragraphs)];
}

function createResolvedHeadingNode(
  node: StegoHeadingNode,
  defaults: StyleDefaults,
): StegoHeadingNode {
  const resolved = mergeHeadingStyle(
    resolveHeadingDefaults(node.level, defaults.bodyStyle, defaults.headingStyle, defaults.headingStyles),
    {
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
      color: node.color,
    },
  );

  return createHeadingNode(node.level, resolved || {}, node.children);
}

function createResolvedMarkdownHeadingNode(
  level: StegoHeadingNode["level"],
  source: string,
  anchorId: string | undefined,
  defaults: StyleDefaults,
  explicit?: HeadingStyle,
): StegoNode {
  return createMarkdownHeadingNode(
    level,
    source,
    anchorId,
    mergeHeadingStyle(
      resolveHeadingDefaults(level, defaults.bodyStyle, defaults.headingStyle, defaults.headingStyles),
      explicit,
    ) || {},
  );
}

function createResolvedParagraphNode(
  node: StegoParagraphNode,
  bodyStyle: BodyStyle | undefined,
): StegoParagraphNode {
  return createParagraphNode(
    mergeBodyStyle(bodyStyle, {
      spaceBefore: node.spaceBefore,
      spaceAfter: node.spaceAfter,
      insetLeft: node.insetLeft,
      insetRight: node.insetRight,
      firstLineIndent: node.firstLineIndent,
      align: node.align,
      fontFamily: node.fontFamily,
      fontSize: node.fontSize,
      lineSpacing: node.lineSpacing,
    }) || {},
    node.children,
  );
}

function splitMarkdownIntoBlocks(
  source: string,
  headings: Map<number, string>,
  defaults: StyleDefaults,
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
        const parsedDirective = parseStegoMarkdownDirective(paragraphSource);
        if (parsedDirective?.kind === "spacer") {
          blocks.push(
            createSpacerNode(parsedDirective.lines, {
              fontSize: defaults.bodyStyle?.fontSize,
              lineSpacing: defaults.bodyStyle?.lineSpacing,
            }),
          );
        } else {
          blocks.push(createMarkdownParagraphNode(paragraphSource, defaults.bodyStyle || {}));
        }
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
          createResolvedMarkdownHeadingNode(
            Number.isFinite(level) ? (level as StegoHeadingNode["level"]) : 1,
            headingSource,
            headings.get(lineNumber),
            defaults,
          ),
        );
      } else if (headingSource) {
        blocks.push(createMarkdownBlockNode(headingSource));
      }
      index = closeIndex + 1;
      continue;
    }

    if (token.type === "html_block") {
      const directiveSource = sliceSourceByMap(lines, token.map);
      if (directiveSource) {
        const parsedDirective = parseStegoMarkdownDirective(directiveSource);
        if (parsedDirective?.kind === "spacer") {
          blocks.push(
            createSpacerNode(parsedDirective.lines, {
              fontSize: defaults.bodyStyle?.fontSize,
              lineSpacing: defaults.bodyStyle?.lineSpacing,
            }),
          );
          index += 1;
          continue;
        }
      }
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

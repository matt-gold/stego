export type ParsedStegoMarkdownDirective = {
  kind: "spacer";
  lines: number;
};

const SELF_CLOSING_DIRECTIVE_PATTERN = /^<\s*(stego-[a-z0-9-]+)(?:\s+([^>]*?))?\s*\/\s*>$/i;
const PAIRED_DIRECTIVE_PATTERN = /^<\s*(stego-[a-z0-9-]+)\b[^>]*>[\s\S]*<\s*\/\s*\1\s*>$/i;
const ATTRIBUTE_PATTERN = /([a-zA-Z_:][a-zA-Z0-9:._-]*)\s*=\s*"([^"]*)"/g;

export function parseStegoMarkdownDirective(source: string): ParsedStegoMarkdownDirective | null {
  const trimmed = source.trim();
  if (!/^<\s*stego-/i.test(trimmed)) {
    return null;
  }

  // Only treat stego tags as block directives when they occupy the whole block.
  // Inline stego-span content is handled later in the markdown writer, even when
  // it appears at the beginning of a paragraph.
  if (!looksLikeStandaloneDirectiveBlock(trimmed)) {
    return null;
  }

  const pairedMatch = trimmed.match(PAIRED_DIRECTIVE_PATTERN);
  if (pairedMatch) {
    const tag = pairedMatch[1].toLowerCase();
    if (tag === "stego-span") {
      return null;
    }
    throw new Error(`<${tag}> only supports self-closing syntax in V1.`);
  }

  const selfClosing = trimmed.match(SELF_CLOSING_DIRECTIVE_PATTERN);
  if (!selfClosing) {
    const tag = extractDirectiveTag(trimmed);
    if (tag) {
      throw new Error(`Unsupported markdown directive '${tag}'. Supported directives: stego-spacer.`);
    }
    return null;
  }

  const tag = selfClosing[1].toLowerCase();
  if (tag !== "stego-spacer") {
    throw new Error(`Unsupported markdown directive '<${tag} />'. Supported directives: stego-spacer.`);
  }

  const rawAttributes = (selfClosing[2] || "").trim();
  const attributes = parseDirectiveAttributes(rawAttributes, trimmed);
  const attributeNames = Object.keys(attributes);
  if (attributeNames.some((name) => name !== "lines")) {
    throw new Error(`Unsupported attributes on stego-spacer. Supported attributes: lines.`);
  }

  const rawLines = attributes.lines;
  if (rawLines === undefined) {
    return { kind: "spacer", lines: 1 };
  }

  if (!/^\d+$/.test(rawLines)) {
    throw new Error(`Invalid stego-spacer lines value '${rawLines}'. Expected a positive integer.`);
  }

  const lines = Number(rawLines);
  if (!Number.isInteger(lines) || lines < 1) {
    throw new Error(`Invalid stego-spacer lines value '${rawLines}'. Expected a positive integer.`);
  }

  return {
    kind: "spacer",
    lines,
  };
}

function parseDirectiveAttributes(rawAttributes: string, source: string): Record<string, string> {
  if (!rawAttributes) {
    return {};
  }

  const attributes: Record<string, string> = {};
  let consumed = "";
  let match: RegExpExecArray | null;
  ATTRIBUTE_PATTERN.lastIndex = 0;
  while ((match = ATTRIBUTE_PATTERN.exec(rawAttributes)) !== null) {
    consumed += match[0];
    attributes[match[1]] = match[2];
  }

  const normalizedRaw = rawAttributes.replace(/\s+/g, "");
  const normalizedConsumed = consumed.replace(/\s+/g, "");
  if (normalizedRaw !== normalizedConsumed) {
    throw new Error(`Invalid markdown directive syntax '${source}'. Attributes must use quoted HTML-style values.`);
  }

  return attributes;
}

function extractDirectiveTag(source: string): string | null {
  const match = source.match(/^<\s*(\/?\s*stego-[a-z0-9-]+)/i);
  if (!match) {
    return null;
  }
  return `<${match[1].replace(/\s+/g, "")}>`;
}

function looksLikeStandaloneDirectiveBlock(source: string): boolean {
  if (/^<\s*stego-[a-z0-9-]+(?:\s+[^>]*)?\s*\/\s*>$/i.test(source)) {
    return true;
  }

  if (/^<\s*stego-[a-z0-9-]+\b/i.test(source) && /<\s*\/\s*stego-[a-z0-9-]+\s*>$/i.test(source)) {
    return true;
  }

  return false;
}

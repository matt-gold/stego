import * as yaml from "js-yaml";

export type FrontmatterScalar = string | number | boolean | null;
export type FrontmatterValue =
  | FrontmatterScalar
  | FrontmatterValue[]
  | { [key: string]: FrontmatterValue };
export type FrontmatterRecord = Record<string, FrontmatterValue>;

export interface ParsedMarkdownDocument {
  lineEnding: string;
  hasFrontmatter: boolean;
  frontmatter: FrontmatterRecord;
  body: string;
}

export function parseMarkdownDocument(raw: string): ParsedMarkdownDocument {
  const lineEnding = raw.includes("\r\n") ? "\r\n" : "\n";
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);

  if (!match) {
    return {
      lineEnding,
      hasFrontmatter: false,
      frontmatter: {},
      body: raw
    };
  }

  const yamlText = match[1];
  const loaded = yamlText.trim().length > 0
    ? yaml.load(yamlText)
    : {};

  if (loaded == null) {
    return {
      lineEnding,
      hasFrontmatter: true,
      frontmatter: {},
      body: raw.slice(match[0].length)
    };
  }

  if (typeof loaded !== "object" || Array.isArray(loaded)) {
    throw new Error("Frontmatter must be a YAML object with key/value pairs.");
  }

  return {
    lineEnding,
    hasFrontmatter: true,
    frontmatter: { ...(loaded as FrontmatterRecord) },
    body: raw.slice(match[0].length)
  };
}

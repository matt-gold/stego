import path from "node:path";
import { parseMarkdownDocument, type FrontmatterRecord } from "../frontmatter/index.ts";

export type LeafFormat = "markdown" | "plaintext";

export type LeafHeadingTarget = {
  text: string;
  anchor: string;
  line: number;
};

export type BranchMetadata = {
  label?: string;
};

export type ParsedBranchDocument = {
  metadata: BranchMetadata;
  body: string;
};

export const BRANCH_FILENAME = "_branch.md";
export const LEAF_ID_PATTERN = /^[A-Z][A-Z0-9]*-[A-Z0-9][A-Z0-9-]*$/;

export function isValidLeafId(value: string): boolean {
  return LEAF_ID_PATTERN.test(value.trim());
}

export function inferLeafFormat(filePath: string): LeafFormat {
  const normalized = filePath.toLowerCase();
  if (normalized.endsWith(".md") || normalized.endsWith(".markdown")) {
    return "markdown";
  }
  return "plaintext";
}

export function isBranchFile(filePath: string): boolean {
  return path.basename(filePath).toLowerCase() === BRANCH_FILENAME;
}

export function isSupportedLeafContentFile(filePath: string): boolean {
  const normalized = filePath.toLowerCase();
  if (isBranchFile(normalized)) {
    return false;
  }
  return normalized.endsWith(".md")
    || normalized.endsWith(".markdown")
    || normalized.endsWith(".txt")
    || normalized.endsWith(".text");
}

export function buildBranchKey(contentRoot: string, dirPath: string): string {
  const relative = path.relative(path.resolve(contentRoot), path.resolve(dirPath));
  if (!relative || relative === ".") {
    return "";
  }
  return relative.split(path.sep).join("/");
}

export function buildBranchName(dirPath: string): string {
  return path.basename(path.resolve(dirPath));
}

export function buildBranchParentKey(key: string): string | undefined {
  if (!key) {
    return undefined;
  }
  const slashIndex = key.lastIndexOf("/");
  if (slashIndex === -1) {
    return "";
  }
  return key.slice(0, slashIndex);
}

export function buildBranchLabel(name: string, metadataLabel?: string): string {
  const explicit = metadataLabel?.trim();
  if (explicit) {
    return explicit;
  }
  return toTitleCase(name);
}

export function parseBranchDocument(raw: string, filePath = BRANCH_FILENAME): ParsedBranchDocument {
  let parsed;
  try {
    parsed = parseMarkdownDocument(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Branch file '${filePath}' has invalid frontmatter: ${message}`);
  }

  const metadata = validateBranchFrontmatter(parsed.frontmatter, filePath);
  return {
    metadata,
    body: parsed.body.trim()
  };
}

export function validateBranchFrontmatter(
  frontmatter: FrontmatterRecord,
  filePath = BRANCH_FILENAME
): BranchMetadata {
  const allowedKeys = new Set(["label"]);
  for (const key of Object.keys(frontmatter)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Branch file '${filePath}' has unsupported frontmatter key '${key}'. Only 'label' is allowed.`);
    }
  }

  const rawLabel = frontmatter.label;
  if (rawLabel == null) {
    return {};
  }
  if (typeof rawLabel !== "string" || rawLabel.trim().length === 0) {
    throw new Error(`Branch file '${filePath}' must define 'label' as a non-empty string.`);
  }
  return { label: rawLabel.trim() };
}

export function slugifyLeafHeading(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export function buildLeafRootAnchor(leafId: string): string {
  return leafId;
}

export function buildLeafHeadingAnchor(leafId: string, slug: string): string {
  return `${leafId}--${slug}`;
}

export function collectLeafHeadingTargets(body: string, leafId: string): LeafHeadingTarget[] {
  const lines = body.split(/\r?\n/);
  const counts = new Map<string, number>();
  const headings: LeafHeadingTarget[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^#{1,6}\s+(.+?)\s*(?:\{#([^}]+)\})?\s*$/);
    if (!match) {
      continue;
    }

    const text = match[1].trim();
    const explicitAnchor = match[2]?.trim();
    const slugBase = explicitAnchor || slugifyLeafHeading(text);
    if (!slugBase) {
      continue;
    }

    const seen = counts.get(slugBase) || 0;
    const occurrence = seen + 1;
    counts.set(slugBase, occurrence);

    const slug = occurrence === 1 ? slugBase : `${slugBase}-${occurrence}`;
    headings.push({
      text,
      anchor: buildLeafHeadingAnchor(leafId, slug),
      line: index + 1
    });
  }

  return headings;
}

export function injectLeafHeadingAnchors(body: string, leafId: string): string {
  const lines = body.split(/\r?\n/);
  const counts = new Map<string, number>();

  return lines.map((line) => {
    const match = line.match(/^(#{1,6}\s+)(.+?)\s*(?:\{#([^}]+)\})?\s*$/);
    if (!match) {
      return line;
    }

    const prefix = match[1];
    const text = match[2].trim();
    const explicitAnchor = match[3]?.trim();
    const slugBase = explicitAnchor || slugifyLeafHeading(text);
    if (!slugBase) {
      return `${prefix}${text}`;
    }

    const seen = counts.get(slugBase) || 0;
    const occurrence = seen + 1;
    counts.set(slugBase, occurrence);
    const slug = occurrence === 1 ? slugBase : `${slugBase}-${occurrence}`;

    return `${prefix}${text} {#${buildLeafHeadingAnchor(leafId, slug)}}`;
  }).join("\n");
}

export function findLeafHeadingTarget(
  headings: LeafHeadingTarget[],
  headingText: string
): { target?: LeafHeadingTarget; ambiguous?: boolean } {
  const normalized = headingText.trim().replace(/\s+/g, " ").toLowerCase();
  const matches = headings.filter((entry) => entry.text.trim().replace(/\s+/g, " ").toLowerCase() === normalized);
  if (matches.length === 0) {
    return {};
  }
  if (matches.length > 1) {
    return { ambiguous: true };
  }
  return { target: matches[0] };
}

function toTitleCase(value: string): string {
  const normalized = value.replace(/[-_]+/g, " ").trim();
  if (!normalized) {
    return value;
  }
  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

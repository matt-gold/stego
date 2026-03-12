import fs from "node:fs";
import path from "node:path";
import { parseMarkdownDocument } from "../../../../shared/src/domain/frontmatter/index.ts";
import type { SpineCategoryRecord, SpineEntryRecord } from "../../template/index.ts";

export type LoadedSpine = {
  entries: SpineEntryRecord[];
  categories: SpineCategoryRecord[];
};

export function loadSpine(projectRoot: string, spineDir: string): LoadedSpine {
  if (!fs.existsSync(spineDir)) {
    return { entries: [], categories: [] };
  }

  const categories: SpineCategoryRecord[] = [];
  const entries: SpineEntryRecord[] = [];

  for (const dirent of fs.readdirSync(spineDir, { withFileTypes: true })) {
    if (!dirent.isDirectory()) {
      continue;
    }

    const categoryKey = dirent.name;
    const categoryDir = path.join(spineDir, categoryKey);
    const categoryFile = path.join(categoryDir, "_category.md");
    const categoryParsed = fs.existsSync(categoryFile)
      ? parseSpineMarkdownFile(categoryFile)
      : { frontmatter: {}, body: "" };

    categories.push({
      kind: "spine-category",
      key: categoryKey,
      label: toDisplayLabel((categoryParsed.frontmatter.label as string | undefined) || categoryKey),
      path: categoryFile,
      metadata: categoryParsed.frontmatter
    });

    for (const filePath of collectMarkdownFiles(categoryDir)) {
      if (path.basename(filePath) === "_category.md") {
        continue;
      }
      entries.push(loadSpineEntry(projectRoot, categoryKey, filePath));
    }
  }

  entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  categories.sort((a, b) => a.key.localeCompare(b.key));
  return { entries, categories };
}

function loadSpineEntry(projectRoot: string, category: string, filePath: string): SpineEntryRecord {
  const parsed = parseSpineMarkdownFile(filePath);
  const basename = path.basename(filePath, ".md");
  const body = parsed.body.trim();
  return {
    kind: "spine-entry",
    path: filePath,
    relativePath: path.relative(projectRoot, filePath),
    category,
    key: basename,
    label: resolveEntryLabel(parsed.frontmatter.label, body, basename),
    metadata: parsed.frontmatter,
    body
  };
}

function collectMarkdownFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectMarkdownFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(fullPath);
    }
  }
  return results;
}

function resolveEntryLabel(frontmatterLabel: unknown, body: string, fallback: string): string {
  if (typeof frontmatterLabel === "string" && frontmatterLabel.trim()) {
    return frontmatterLabel.trim();
  }
  const headingMatch = body.match(/^#\s+(.+)$/m);
  if (headingMatch && headingMatch[1].trim()) {
    return headingMatch[1].trim();
  }
  return toDisplayLabel(fallback);
}

function parseSpineMarkdownFile(filePath: string): { frontmatter: Record<string, unknown>; body: string } {
  const raw = fs.readFileSync(filePath, "utf8");
  try {
    return parseMarkdownDocument(raw);
  } catch {
    return {
      frontmatter: {},
      body: raw
    };
  }
}

function toDisplayLabel(value: string): string {
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()).trim();
}

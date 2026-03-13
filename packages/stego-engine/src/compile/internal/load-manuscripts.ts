import fs from "node:fs";
import path from "node:path";
import { parseMarkdownDocument } from "@stego/shared/domain/frontmatter";
import { parseCommentAppendix } from "@stego/shared/domain/comments";
import { rewriteMarkdownImagesForChapter } from "@stego/shared/domain/images";
import type { ManuscriptRecord } from "../../template/index.ts";

export function loadManuscripts(
  projectRoot: string,
  manuscriptDir: string,
  projectMeta: Record<string, unknown>
): ManuscriptRecord[] {
  if (!fs.existsSync(manuscriptDir)) {
    return [];
  }

  const files = fs.readdirSync(manuscriptDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.join(manuscriptDir, entry.name))
    .sort();

  return files.map((filePath) => loadManuscript(projectRoot, filePath, projectMeta))
    .sort((a, b) => compareOrders(a.order, b.order) || a.relativePath.localeCompare(b.relativePath));
}

function loadManuscript(projectRoot: string, filePath: string, projectMeta: Record<string, unknown>): ManuscriptRecord {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = parseMarkdownDocument(raw);
  const withoutComments = parseCommentAppendix(parsed.body).contentWithoutComments;
  const relativePath = path.relative(projectRoot, filePath);
  const basename = path.basename(filePath, ".md");

  return {
    kind: "manuscript",
    path: filePath,
    relativePath,
    slug: toSlug(basename),
    titleFromFilename: toTitleFromFilename(basename),
    metadata: parsed.frontmatter,
    body: rewriteMarkdownImagesForChapter({
      body: withoutComments.trim(),
      chapterPath: filePath,
      projectRoot,
      projectMeta,
      frontmatter: parsed.frontmatter
    }),
    order: parseOrder(basename)
  };
}

function parseOrder(basename: string): number | null {
  const match = basename.match(/^(\d+)[-_]/);
  return match ? Number(match[1]) : null;
}

function compareOrders(a: number | null, b: number | null): number {
  if (a == null && b == null) {
    return 0;
  }
  if (a == null) {
    return 1;
  }
  if (b == null) {
    return -1;
  }
  return a - b;
}

function toSlug(value: string): string {
  return value
    .replace(/^\d+[-_]?/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toTitleFromFilename(value: string): string {
  const normalized = value.replace(/^\d+[-_]?/, "").replace(/[-_]+/g, " ").trim();
  if (!normalized) {
    return value;
  }
  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

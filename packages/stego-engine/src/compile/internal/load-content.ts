import fs from "node:fs";
import path from "node:path";
import {
  BRANCH_FILENAME,
  buildBranchKey,
  buildBranchLabel,
  buildBranchName,
  buildBranchParentKey,
  collectLeafHeadingTargets,
  inferLeafFormat,
  isBranchFile,
  isSupportedLeafContentFile,
  isValidLeafId,
  parseBranchDocument
} from "@stego-labs/shared/domain/content";
import { parseMarkdownDocument } from "@stego-labs/shared/domain/frontmatter";
import { parseCommentAppendix } from "@stego-labs/shared/domain/comments";
import { rewriteMarkdownImagesForChapter } from "@stego-labs/shared/domain/images";
import type { BranchRecord, LeafRecord } from "../../template/index.ts";

export type ContentGraph = {
  leaves: LeafRecord[];
  branches: BranchRecord[];
};

export function loadContentGraph(
  projectRoot: string,
  contentDir: string,
  projectMeta: Record<string, unknown>
): ContentGraph {
  if (!fs.existsSync(contentDir)) {
    return {
      leaves: [],
      branches: [createImplicitBranch(projectRoot, contentDir, contentDir)]
    };
  }

  const leaves: LeafRecord[] = [];
  const branches: BranchRecord[] = [];
  collectDirectory(contentDir, projectRoot, contentDir, projectMeta, leaves, branches);
  validateLeafIds(leaves);

  return {
    leaves: leaves.sort((a, b) => compareOrders(a.order, b.order) || a.relativePath.localeCompare(b.relativePath)),
    branches: branches.sort((a, b) => a.depth - b.depth || a.key.localeCompare(b.key))
  };
}

function collectDirectory(
  dirPath: string,
  projectRoot: string,
  contentRoot: string,
  projectMeta: Record<string, unknown>,
  leaves: LeafRecord[],
  branches: BranchRecord[]
): void {
  const branch = loadBranch(projectRoot, contentRoot, dirPath);
  branches.push(branch);

  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectDirectory(fullPath, projectRoot, contentRoot, projectMeta, leaves, branches);
      continue;
    }
    if (!entry.isFile() || isBranchFile(fullPath) || !isSupportedLeafContentFile(fullPath)) {
      continue;
    }
    leaves.push(loadLeaf(projectRoot, fullPath, projectMeta));
  }
}

function loadBranch(projectRoot: string, contentRoot: string, dirPath: string): BranchRecord {
  const branchFilePath = path.join(dirPath, BRANCH_FILENAME);
  const relativeDir = path.relative(projectRoot, dirPath).split(path.sep).join("/");
  const key = buildBranchKey(contentRoot, dirPath);
  const parentKey = buildBranchParentKey(key);
  const depth = key ? key.split("/").length : 0;
  const name = key ? buildBranchName(dirPath) : "content";

  if (!fs.existsSync(branchFilePath)) {
    return createImplicitBranch(projectRoot, contentRoot, dirPath);
  }

  const raw = fs.readFileSync(branchFilePath, "utf8");
  const parsed = parseBranchDocument(raw, path.relative(projectRoot, branchFilePath));

  return {
    kind: "branch",
    key,
    name,
    label: buildBranchLabel(name, parsed.metadata.label),
    parentKey,
    depth,
    relativeDir,
    path: branchFilePath,
    relativePath: path.relative(projectRoot, branchFilePath).split(path.sep).join("/"),
    metadata: parsed.metadata,
    body: parsed.body || undefined
  };
}

function createImplicitBranch(projectRoot: string, contentRoot: string, dirPath: string): BranchRecord {
  const key = buildBranchKey(contentRoot, dirPath);
  const name = key ? buildBranchName(dirPath) : "content";
  return {
    kind: "branch",
    key,
    name,
    label: key ? buildBranchLabel(name) : "Content",
    parentKey: buildBranchParentKey(key),
    depth: key ? key.split("/").length : 0,
    relativeDir: path.relative(projectRoot, dirPath).split(path.sep).join("/"),
    metadata: {}
  };
}

function validateLeafIds(leaves: LeafRecord[]): void {
  const seenIds = new Set<string>();
  for (const leaf of leaves) {
    if (!leaf.id) {
      throw new Error(`Leaf '${leaf.relativePath}' is missing required frontmatter id.`);
    }
    if (!isValidLeafId(leaf.id)) {
      throw new Error(`Leaf '${leaf.relativePath}' has invalid id '${leaf.id}'. Use token-style ids like CFG-TEMPLATES.`);
    }
    if (seenIds.has(leaf.id)) {
      throw new Error(`Duplicate leaf id '${leaf.id}' found at '${leaf.relativePath}'.`);
    }
    seenIds.add(leaf.id);
  }
}

function loadLeaf(projectRoot: string, filePath: string, projectMeta: Record<string, unknown>): LeafRecord {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = parseMarkdownDocument(raw);
  const withoutComments = parseCommentAppendix(parsed.body).contentWithoutComments;
  const relativePath = path.relative(projectRoot, filePath).split(path.sep).join("/");
  const basename = path.basename(filePath).replace(/\.(md|markdown|txt|text)$/i, "");
  const format = inferLeafFormat(filePath);
  const body = format === "markdown"
    ? rewriteMarkdownImagesForChapter({
      body: withoutComments.trim(),
      chapterPath: filePath,
      projectRoot,
      projectMeta,
      frontmatter: parsed.frontmatter
    })
    : withoutComments.trim();
  const id = typeof parsed.frontmatter.id === "string" ? parsed.frontmatter.id.trim() : "";

  return {
    kind: "leaf",
    id,
    format,
    path: filePath,
    relativePath,
    titleFromFilename: toTitleFromFilename(basename),
    metadata: parsed.frontmatter,
    body,
    order: parseOrder(path.basename(filePath)),
    headings: format === "markdown" ? collectLeafHeadingTargets(body, id) : []
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

function toTitleFromFilename(value: string): string {
  const normalized = value.replace(/^\d+[-_]?/, "").replace(/[-_]+/g, " ").trim();
  if (!normalized) {
    return value;
  }
  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

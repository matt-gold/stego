import fs from "node:fs";
import path from "node:path";
import {
  applyLeafPolicyDefaults,
  BRANCH_FILENAME,
  buildBranchKey,
  buildBranchLabel,
  buildBranchName,
  buildBranchParentKey,
  collectLeafHeadingTargets,
  createEmptyEffectiveBranchLeafPolicy,
  type EffectiveBranchLeafPolicy,
  inferLeafFormat,
  isBranchFile,
  isSupportedLeafContentFile,
  isValidLeafId,
  mergeBranchLeafPolicy,
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
  collectDirectory(
    contentDir,
    projectRoot,
    contentDir,
    projectMeta,
    createEmptyEffectiveBranchLeafPolicy(),
    leaves,
    branches
  );
  validateLeafIds(leaves);
  const sortedLeaves = leaves.sort((a, b) => compareOrders(a.order, b.order) || a.relativePath.localeCompare(b.relativePath));
  const sortedBranches = branches.sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));
  attachBranchLeaves(sortedLeaves, sortedBranches);
  attachBranchChildren(sortedBranches);

  return {
    leaves: sortedLeaves,
    branches: sortedBranches
  };
}

function collectDirectory(
  dirPath: string,
  projectRoot: string,
  contentRoot: string,
  projectMeta: Record<string, unknown>,
  inheritedLeafPolicy: EffectiveBranchLeafPolicy,
  leaves: LeafRecord[],
  branches: BranchRecord[]
): void {
  const { branch, effectiveLeafPolicy } = loadBranchContext(
    projectRoot,
    contentRoot,
    dirPath,
    inheritedLeafPolicy
  );
  branches.push(branch);

  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectDirectory(fullPath, projectRoot, contentRoot, projectMeta, effectiveLeafPolicy, leaves, branches);
      continue;
    }
    if (!entry.isFile() || isBranchFile(fullPath) || !isSupportedLeafContentFile(fullPath)) {
      continue;
    }
    leaves.push(loadLeaf(projectRoot, contentRoot, fullPath, projectMeta, effectiveLeafPolicy));
  }
}

function loadBranchContext(
  projectRoot: string,
  contentRoot: string,
  dirPath: string,
  inheritedLeafPolicy: EffectiveBranchLeafPolicy
): { branch: BranchRecord; effectiveLeafPolicy: EffectiveBranchLeafPolicy } {
  const branchFilePath = path.join(dirPath, BRANCH_FILENAME);
  const relativeDir = path.relative(projectRoot, dirPath).split(path.sep).join("/");
  const id = buildBranchKey(contentRoot, dirPath);
  const parentId = buildBranchParentKey(id);
  const depth = id ? id.split("/").length : 0;
  const name = id ? buildBranchName(dirPath) : "content";

  if (!fs.existsSync(branchFilePath)) {
    return {
      branch: createImplicitBranch(projectRoot, contentRoot, dirPath),
      effectiveLeafPolicy: inheritedLeafPolicy
    };
  }

  const raw = fs.readFileSync(branchFilePath, "utf8");
  const parsed = parseBranchDocument(raw, path.relative(projectRoot, branchFilePath));

  return {
    branch: {
      kind: "branch",
      id,
      name,
      label: buildBranchLabel(name, parsed.metadata.label),
      parentId,
      depth,
      relativeDir,
      path: branchFilePath,
      relativePath: path.relative(projectRoot, branchFilePath).split(path.sep).join("/"),
      metadata: parsed.metadata,
      body: parsed.body || undefined,
      leaves: [],
      branches: []
    },
    effectiveLeafPolicy: mergeBranchLeafPolicy(inheritedLeafPolicy, parsed.metadata.leafPolicy)
  };
}

function createImplicitBranch(projectRoot: string, contentRoot: string, dirPath: string): BranchRecord {
  const id = buildBranchKey(contentRoot, dirPath);
  const name = id ? buildBranchName(dirPath) : "content";
  return {
    kind: "branch",
    id,
    name,
    label: id ? buildBranchLabel(name) : "Content",
    parentId: buildBranchParentKey(id),
    depth: id ? id.split("/").length : 0,
    relativeDir: path.relative(projectRoot, dirPath).split(path.sep).join("/"),
    metadata: {},
    leaves: [],
    branches: []
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

function loadLeaf(
  projectRoot: string,
  contentRoot: string,
  filePath: string,
  projectMeta: Record<string, unknown>,
  effectiveLeafPolicy: EffectiveBranchLeafPolicy
): LeafRecord {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = parseMarkdownDocument(raw);
  const effectiveFrontmatter = applyLeafPolicyDefaults(parsed.frontmatter, effectiveLeafPolicy);
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
      frontmatter: effectiveFrontmatter
    })
    : withoutComments.trim();
  const id = typeof effectiveFrontmatter.id === "string" ? effectiveFrontmatter.id.trim() : "";

  return {
    kind: "leaf",
    id,
    branchId: buildBranchKey(contentRoot, path.dirname(filePath)),
    format,
    path: filePath,
    relativePath,
    titleFromFilename: toTitleFromFilename(basename),
    metadata: {
      ...effectiveFrontmatter,
      id
    },
    body,
    order: parseOrder(path.basename(filePath)),
    headings: format === "markdown" ? collectLeafHeadingTargets(body, id) : []
  };
}

function attachBranchLeaves(leaves: LeafRecord[], branches: BranchRecord[]): void {
  const leavesByBranchId = new Map<string, LeafRecord[]>();
  for (const leaf of leaves) {
    const existing = leavesByBranchId.get(leaf.branchId);
    if (existing) {
      existing.push(leaf);
      continue;
    }
    leavesByBranchId.set(leaf.branchId, [leaf]);
  }

  for (const branch of branches) {
    branch.leaves = leavesByBranchId.get(branch.id) ?? [];
  }
}

function attachBranchChildren(branches: BranchRecord[]): void {
  const branchById = new Map<string, BranchRecord>();
  for (const branch of branches) {
    branch.branches = [];
    branchById.set(branch.id, branch);
  }

  for (const branch of branches) {
    if (!branch.id) {
      continue;
    }
    const parent = branchById.get(branch.parentId ?? "");
    if (!parent) {
      continue;
    }
    parent.branches.push(branch);
  }

  for (const branch of branches) {
    branch.branches.sort((left, right) => left.id.localeCompare(right.id));
  }
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

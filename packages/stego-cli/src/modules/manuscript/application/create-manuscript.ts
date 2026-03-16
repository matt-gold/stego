import fs from "node:fs";
import path from "node:path";
import {
  BRANCH_FILENAME,
  createEmptyEffectiveBranchLeafPolicy,
  isValidLeafId,
  mergeBranchLeafPolicy,
  parseBranchDocument,
  type EffectiveBranchLeafPolicy
} from "@stego-labs/shared/domain/content";
import type { LeafOutputFormat, NewLeafInput, NewLeafResult } from "../types.ts";
import {
  ensureLeafDir,
  fileExists,
  joinPath,
  listExistingLeafIds,
  listLeafOrderEntries,
  writeTextFile
} from "../infra/manuscript-repo.ts";
import {
  inferNextLeafPrefix,
  parseLeafPrefix,
  parseOrderFromLeafFilename,
  parseRequestedLeafFilename
} from "./order-inference.ts";

const DEFAULT_NEW_LEAF_SLUG = "new-leaf";
const DEFAULT_MANUSCRIPT_BRANCH_DIR = "manuscript";

export function createNewLeaf(input: NewLeafInput): NewLeafResult {
  const project = input.project;
  const targetDir = resolveTargetDir(project.contentDir, input.requestedDirRaw);
  ensureLeafDir(targetDir);

  const effectiveLeafPolicy = resolveEffectiveLeafPolicyForDirectory(project.contentDir, targetDir);
  const existingEntries = listLeafOrderEntries(targetDir);
  const explicitPrefix = parseLeafPrefix(input.requestedPrefixRaw);
  const requestedFilename = parseRequestedLeafFilename(input.requestedFilenameRaw);
  if (requestedFilename && explicitPrefix != null) {
    throw new Error("Options --filename and --i/-i cannot be used together.");
  }

  let filename: string;
  if (requestedFilename) {
    const requestedOrder = parseOrderFromLeafFilename(requestedFilename);
    if (requestedOrder != null) {
      const collision = existingEntries.find((entry) => entry.order === requestedOrder);
      if (collision) {
        throw new Error(
          `Leaf prefix '${requestedOrder}' is already used by '${collision.filename}'. Choose a different filename prefix.`
        );
      }
    }
    filename = requestedFilename;
  } else {
    const nextPrefix = explicitPrefix ?? inferNextLeafPrefix(existingEntries);
    const collision = existingEntries.find((entry) => entry.order === nextPrefix);
    if (collision) {
      throw new Error(
        `Leaf prefix '${nextPrefix}' is already used by '${collision.filename}'. Re-run with --i <number> to choose an unused prefix.`
      );
    }
    filename = `${nextPrefix}-${DEFAULT_NEW_LEAF_SLUG}.md`;
  }

  const leafPath = joinPath(targetDir, filename);
  if (fileExists(leafPath)) {
    throw new Error(`Leaf already exists: ${filename}`);
  }

  const existingLeafIds = new Set(listExistingLeafIds(project.contentDir));
  const leafId = resolveLeafId(input.requestedIdRaw, filename, existingLeafIds);

  writeTextFile(
    leafPath,
    renderNewLeafTemplate(effectiveLeafPolicy, leafId)
  );

  return {
    projectId: project.id,
    filePath: path.relative(project.workspace.repoRoot, leafPath)
  };
}

export function parseNewLeafOutputFormat(raw: string | undefined): LeafOutputFormat {
  if (!raw || raw === "text") {
    return "text";
  }
  if (raw === "json") {
    return "json";
  }
  throw new Error("Invalid --format value. Use 'text' or 'json'.");
}

function resolveTargetDir(contentRoot: string, requestedDirRaw: string | undefined): string {
  const normalized = requestedDirRaw?.trim();
  if (!normalized || normalized === ".") {
    return resolveDefaultTargetDir(contentRoot);
  }
  if (path.isAbsolute(normalized)) {
    throw new Error(`Invalid --dir '${requestedDirRaw}'. Use a path relative to content/.`);
  }

  const targetDir = path.resolve(contentRoot, normalized);
  const relative = path.relative(path.resolve(contentRoot), targetDir);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Invalid --dir '${requestedDirRaw}'. Target must stay within content/.`);
  }
  return targetDir;
}

function resolveDefaultTargetDir(contentRoot: string): string {
  const resolvedContentRoot = path.resolve(contentRoot);
  const manuscriptDir = path.join(resolvedContentRoot, DEFAULT_MANUSCRIPT_BRANCH_DIR);
  if (fs.existsSync(manuscriptDir) && fs.statSync(manuscriptDir).isDirectory()) {
    return manuscriptDir;
  }
  return resolvedContentRoot;
}

function resolveEffectiveLeafPolicyForDirectory(
  contentRoot: string,
  targetDir: string
): EffectiveBranchLeafPolicy {
  let effectiveLeafPolicy = createEmptyEffectiveBranchLeafPolicy();
  const contentDir = path.resolve(contentRoot);
  let currentDir = path.resolve(targetDir);
  const ancestorDirs: string[] = [];
  while (true) {
    const relative = path.relative(contentDir, currentDir);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      break;
    }
    ancestorDirs.push(currentDir);
    if (currentDir === contentDir) {
      break;
    }
    currentDir = path.dirname(currentDir);
  }

  ancestorDirs.reverse();
  for (const dirPath of ancestorDirs) {
    const branchPath = path.join(dirPath, BRANCH_FILENAME);
    if (!fs.existsSync(branchPath)) {
      continue;
    }

    const parsed = parseBranchDocument(
      fs.readFileSync(branchPath, "utf8"),
      path.relative(contentDir, branchPath) || BRANCH_FILENAME
    );
    effectiveLeafPolicy = mergeBranchLeafPolicy(effectiveLeafPolicy, parsed.metadata.leafPolicy);
  }

  return effectiveLeafPolicy;
}

function renderNewLeafTemplate(
  effectiveLeafPolicy: EffectiveBranchLeafPolicy,
  leafId: string
): string {
  const lines: string[] = ["---", `id: ${leafId}`];
  const seenKeys = new Set<string>(["id"]);

  if (effectiveLeafPolicy.requiredMetadata.includes("status")) {
    lines.push("status: draft");
    seenKeys.add("status");
  }

  for (const key of effectiveLeafPolicy.requiredMetadata) {
    const normalized = key.trim();
    if (!normalized || seenKeys.has(normalized)) {
      continue;
    }
    seenKeys.add(normalized);
    lines.push(`${normalized}:`);
  }

  lines.push("---", "");
  return `${lines.join("\n")}\n`;
}

function resolveLeafId(
  requestedIdRaw: string | undefined,
  filename: string,
  existingLeafIds: Set<string>
): string {
  const explicit = requestedIdRaw?.trim().toUpperCase();
  if (explicit) {
    if (!isValidLeafId(explicit)) {
      throw new Error(`Leaf id '${requestedIdRaw}' is invalid. Use token-style ids like CFG-TEMPLATES.`);
    }
    if (existingLeafIds.has(explicit)) {
      throw new Error(`Leaf id '${explicit}' is already used by another file. Choose a different --id.`);
    }
    return explicit;
  }

  const basename = path.basename(filename, path.extname(filename)).replace(/^\d+[-_]?/, "");
  const normalized = basename
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
  const fallback = normalized.includes("-") ? normalized : `LEAF-${normalized || "UNTITLED"}`;
  const baseId = isValidLeafId(fallback) ? fallback : "LEAF-UNTITLED";
  if (!existingLeafIds.has(baseId)) {
    return baseId;
  }

  const orderMatch = path.basename(filename, path.extname(filename)).match(/^(\d+)[-_]/);
  const orderSuffix = orderMatch ? `${baseId}-${orderMatch[1]}` : undefined;
  if (orderSuffix && isValidLeafId(orderSuffix) && !existingLeafIds.has(orderSuffix)) {
    return orderSuffix;
  }

  let counter = 2;
  while (true) {
    const candidate = `${baseId}-${counter}`;
    if (isValidLeafId(candidate) && !existingLeafIds.has(candidate)) {
      return candidate;
    }
    counter += 1;
  }
}

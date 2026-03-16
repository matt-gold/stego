import path from "node:path";
import {
  isValidMetadataKey,
  parseMarkdownDocument,
  type FrontmatterRecord,
  type FrontmatterValue
} from "../frontmatter/index.ts";

export type LeafFormat = "markdown" | "plaintext";

export type LeafHeadingTarget = {
  text: string;
  anchor: string;
  line: number;
};

export type BranchMetadata = {
  label?: string;
  leafPolicy?: BranchLeafPolicy;
};

export type BranchLeafPolicy = {
  inherit?: boolean;
  requiredMetadata?: string[];
  defaults?: FrontmatterRecord;
};

export type EffectiveBranchLeafPolicy = {
  requiredMetadata: string[];
  defaults: FrontmatterRecord;
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

export function isLeafFileInContent(contentRoot: string, filePath: string): boolean {
  const normalizedFilePath = path.resolve(filePath);
  if (!isSupportedLeafContentFile(normalizedFilePath)) {
    return false;
  }

  return isPathInsideDirectory(contentRoot, normalizedFilePath);
}

export function resolveLeafBranchId(contentRoot: string, filePath: string): string | undefined {
  if (!isLeafFileInContent(contentRoot, filePath)) {
    return undefined;
  }

  return buildBranchKey(contentRoot, path.dirname(filePath));
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
  const allowedKeys = new Set(["label", "leafPolicy"]);
  for (const key of Object.keys(frontmatter)) {
    if (!allowedKeys.has(key)) {
      throw new Error(
        `Branch file '${filePath}' has unsupported frontmatter key '${key}'. Only 'label' and 'leafPolicy' are allowed.`
      );
    }
  }

  const rawLabel = frontmatter.label;
  const leafPolicy = validateBranchLeafPolicy(frontmatter.leafPolicy, filePath);

  if (rawLabel == null) {
    return leafPolicy ? { leafPolicy } : {};
  }
  if (typeof rawLabel !== "string" || rawLabel.trim().length === 0) {
    throw new Error(`Branch file '${filePath}' must define 'label' as a non-empty string.`);
  }
  return leafPolicy
    ? { label: rawLabel.trim(), leafPolicy }
    : { label: rawLabel.trim() };
}

function validateBranchLeafPolicy(value: unknown, filePath: string): BranchLeafPolicy | undefined {
  if (value == null) {
    return undefined;
  }
  if (!isPlainObject(value)) {
    throw new Error(`Branch file '${filePath}' must define 'leafPolicy' as an object.`);
  }

  const allowedKeys = new Set(["inherit", "requiredMetadata", "defaults"]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(
        `Branch file '${filePath}' has unsupported leafPolicy key '${key}'. Only 'inherit', 'requiredMetadata', and 'defaults' are allowed.`
      );
    }
  }

  const inherit = value.inherit;
  if (inherit != null && typeof inherit !== "boolean") {
    throw new Error(`Branch file '${filePath}' must define 'leafPolicy.inherit' as a boolean.`);
  }

  const requiredMetadata = validateRequiredMetadataArray(
    value.requiredMetadata,
    filePath,
    "leafPolicy.requiredMetadata"
  );
  const defaults = validateLeafPolicyDefaults(value.defaults, filePath);

  const result: BranchLeafPolicy = {};
  if (inherit != null) {
    result.inherit = inherit;
  }
  if (requiredMetadata.length > 0) {
    result.requiredMetadata = requiredMetadata;
  }
  if (Object.keys(defaults).length > 0) {
    result.defaults = defaults;
  }
  return Object.keys(result).length > 0 ? result : {};
}

function validateRequiredMetadataArray(value: unknown, filePath: string, keyPath: string): string[] {
  if (value == null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`Branch file '${filePath}' must define '${keyPath}' as an array of metadata keys.`);
  }

  const result: string[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of value.entries()) {
    if (typeof entry !== "string") {
      throw new Error(
        `Branch file '${filePath}' has non-string ${keyPath} entry at index ${index}.`
      );
    }

    const key = entry.trim();
    if (!key) {
      throw new Error(
        `Branch file '${filePath}' has empty ${keyPath} entry at index ${index}.`
      );
    }

    if (!isValidMetadataKey(key)) {
      throw new Error(
        `Branch file '${filePath}' has invalid ${keyPath} key '${key}'.`
      );
    }

    if (seen.has(key)) {
      throw new Error(
        `Branch file '${filePath}' has duplicate ${keyPath} key '${key}'.`
      );
    }

    seen.add(key);
    result.push(key);
  }

  return result;
}

function validateLeafPolicyDefaults(value: unknown, filePath: string): FrontmatterRecord {
  if (value == null) {
    return {};
  }
  if (!isPlainObject(value)) {
    throw new Error(`Branch file '${filePath}' must define 'leafPolicy.defaults' as an object.`);
  }

  const defaults: FrontmatterRecord = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!isValidMetadataKey(key)) {
      throw new Error(
        `Branch file '${filePath}' has invalid leafPolicy.defaults key '${key}'.`
      );
    }
    defaults[key] = cloneMetadataValue(entry as FrontmatterValue);
  }
  return defaults;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPathInsideDirectory(rootPath: string, candidatePath: string): boolean {
  const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function cloneMetadataValue(value: FrontmatterValue): FrontmatterValue {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneMetadataValue(entry));
  }
  if (isPlainObject(value)) {
    const result: Record<string, FrontmatterValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = cloneMetadataValue(entry as FrontmatterValue);
    }
    return result;
  }
  return value;
}

export function createEmptyEffectiveBranchLeafPolicy(): EffectiveBranchLeafPolicy {
  return {
    requiredMetadata: [],
    defaults: {}
  };
}

export function mergeBranchLeafPolicy(
  parent: EffectiveBranchLeafPolicy,
  leafPolicy?: BranchLeafPolicy
): EffectiveBranchLeafPolicy {
  const base = leafPolicy?.inherit === false ? createEmptyEffectiveBranchLeafPolicy() : parent;
  const requiredMetadata = [...base.requiredMetadata];
  for (const key of leafPolicy?.requiredMetadata ?? []) {
    if (!requiredMetadata.includes(key)) {
      requiredMetadata.push(key);
    }
  }

  return {
    requiredMetadata,
    defaults: {
      ...base.defaults,
      ...cloneMetadataValue(leafPolicy?.defaults ?? {}) as FrontmatterRecord
    }
  };
}

export function resolveBranchLeafPolicy<
  TBranch extends {
    id: string;
    parentId?: string;
    leafPolicy?: BranchLeafPolicy;
    metadata?: BranchMetadata;
  }
>(branches: Iterable<TBranch>, branchId: string | undefined): EffectiveBranchLeafPolicy {
  if (branchId == null) {
    return createEmptyEffectiveBranchLeafPolicy();
  }

  const branchById = new Map<string, TBranch>();
  for (const branch of branches) {
    branchById.set(branch.id, branch);
  }

  const cache = new Map<string, EffectiveBranchLeafPolicy>();
  const resolving = new Set<string>();

  const resolveOne = (id: string | undefined): EffectiveBranchLeafPolicy => {
    if (id == null) {
      return createEmptyEffectiveBranchLeafPolicy();
    }
    if (cache.has(id)) {
      return cache.get(id)!;
    }
    if (resolving.has(id)) {
      throw new Error(`Circular branch leaf policy inheritance detected at branch '${id}'.`);
    }

    const branch = branchById.get(id);
    if (!branch) {
      return createEmptyEffectiveBranchLeafPolicy();
    }

    resolving.add(id);
    const parent = resolveOne(branch.parentId);
    const rawLeafPolicy = branch.leafPolicy ?? branch.metadata?.leafPolicy;
    const effective = mergeBranchLeafPolicy(parent, rawLeafPolicy);
    resolving.delete(id);
    cache.set(id, effective);
    return effective;
  };

  return resolveOne(branchId);
}

export function applyLeafPolicyDefaults(
  frontmatter: FrontmatterRecord,
  leafPolicy: EffectiveBranchLeafPolicy
): FrontmatterRecord {
  return {
    ...cloneMetadataValue(leafPolicy.defaults) as FrontmatterRecord,
    ...frontmatter
  };
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

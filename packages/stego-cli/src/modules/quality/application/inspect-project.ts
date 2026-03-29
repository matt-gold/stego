import fs from "node:fs";
import path from "node:path";
import { parseCommentAppendix } from "@stego-labs/shared/domain/comments";
import {
  applyLeafPolicyDefaults,
  type BranchLeafPolicy,
  createEmptyEffectiveBranchLeafPolicy,
  type EffectiveBranchLeafPolicy,
  isBranchFile,
  isSupportedLeafContentFile,
  isValidLeafId,
  mergeBranchLeafPolicy,
  parseBranchDocument
} from "@stego-labs/shared/domain/content";
import { parseMarkdownDocument, type FrontmatterRecord } from "@stego-labs/shared/domain/frontmatter";
import { resolveProjectManuscriptScope } from "@stego-labs/shared/domain/project";
import { isStageName } from "@stego-labs/shared/domain/stages";
import type {
  ChapterEntry,
  MetadataRecord,
  InspectProjectOptions,
  Issue,
  IssueLevel,
  ParsedCommentThread,
  ProjectInspection
} from "../types.ts";
import type { ProjectContext } from "../../project/index.ts";

export function inspectProject(
  project: ProjectContext,
  options: InspectProjectOptions = {}
): ProjectInspection {
  const repoRoot = project.workspace.repoRoot;
  const issues: Issue[] = [];
  issues.push(...validateProjectImagesConfiguration(project));
  const manuscriptScope = resolveProjectManuscriptScope(
    project.contentDir,
    project.meta,
    (filePath) => fs.existsSync(filePath) && fs.statSync(filePath).isDirectory(),
  );
  if (manuscriptScope.issue) {
    issues.push(
      makeIssue(
        "warning",
        "metadata",
        manuscriptScope.issue,
        path.relative(repoRoot, path.join(project.root, "stego-project.json"))
      )
    );
  }
  const branchLeafPolicyByDir = new Map<string, BranchLeafPolicy>();

  if (project.meta.compileStructure !== undefined) {
    issues.push(
      makeIssue(
        "error",
        "metadata",
        "Legacy 'compileStructure' in stego-project.json is no longer supported. Define build behavior in templates/book.template.tsx instead.",
        path.relative(repoRoot, path.join(project.root, "stego-project.json"))
      )
    );
  }

  if (project.meta.spineCategories !== undefined) {
    issues.push(
      makeIssue(
        "error",
        "metadata",
        "Legacy 'spineCategories' in stego-project.json is unsupported under the leaf model.",
        path.relative(repoRoot, path.join(project.root, "stego-project.json"))
      )
    );
  }

  let chapterFiles: string[] = [];
  let branchFiles: string[] = [];
  const onlyFile = options.onlyFile?.trim();
  if (onlyFile) {
    const resolvedPath = path.resolve(project.root, onlyFile);
    const relativeToProject = path.relative(project.root, resolvedPath);
    if (!relativeToProject || relativeToProject.startsWith("..") || path.isAbsolute(relativeToProject)) {
      issues.push(
        makeIssue("error", "structure", `Requested file is outside the project: ${onlyFile}`, null)
      );
      return { chapters: [], issues };
    }

    if (!fs.existsSync(resolvedPath)) {
      issues.push(makeIssue("error", "structure", `Requested file does not exist: ${onlyFile}`, null));
      return { chapters: [], issues };
    }

    if (!fs.statSync(resolvedPath).isFile() || (!isSupportedLeafContentFile(resolvedPath) && !isBranchFile(resolvedPath))) {
      issues.push(makeIssue("error", "structure", `Requested file must be a supported content file: ${onlyFile}`, null));
      return { chapters: [], issues };
    }

    const relativeToContent = path.relative(project.contentDir, resolvedPath);
    if (relativeToContent.startsWith("..") || path.isAbsolute(relativeToContent)) {
      issues.push(
        makeIssue(
          "error",
          "structure",
          `Requested file must be inside content directory: ${project.contentDir}`,
          null
        )
      );
      return { chapters: [], issues };
    }

    if (isBranchFile(resolvedPath)) {
      branchFiles = [resolvedPath];
    } else {
      chapterFiles = [resolvedPath];
    }
  } else {
    if (!fs.existsSync(project.contentDir)) {
      issues.push(makeIssue("error", "structure", `Missing content directory: ${project.contentDir}`));
      return { chapters: [], issues };
    }

    const discovered = collectContentFiles(project.contentDir);
    chapterFiles = discovered.leafFiles;
    branchFiles = discovered.branchFiles;

    if (chapterFiles.length === 0 && branchFiles.length === 0) {
      issues.push(makeIssue("error", "structure", `No content files found in ${project.contentDir}`));
      return { chapters: [], issues };
    }
  }

  for (const branchPath of branchFiles) {
    issues.push(...validateBranchFile(branchPath, repoRoot));
    try {
      const raw = fs.readFileSync(branchPath, "utf8");
      const parsed = parseBranchDocument(raw, path.relative(repoRoot, branchPath));
      if (parsed.metadata.leafPolicy) {
        branchLeafPolicyByDir.set(path.resolve(path.dirname(branchPath)), parsed.metadata.leafPolicy);
      }
    } catch {
      // Branch parse/validation issues are already reported above.
    }
  }

  const chapters = chapterFiles.map((chapterPath) =>
    parseChapter(
      chapterPath,
      project,
      resolveEffectiveLeafPolicyForPath(
        chapterPath,
        project.contentDir,
        branchLeafPolicyByDir
      )
    )
  );

  for (const chapter of chapters) {
    issues.push(...chapter.issues);
  }

  const idMap = new Map<string, string>();
  for (const chapter of chapters) {
    if (!chapter.id) {
      continue;
    }

    if (idMap.has(chapter.id)) {
      issues.push(
        makeIssue(
          "error",
          "metadata",
          `Duplicate leaf id '${chapter.id}' in ${chapter.relativePath} and ${idMap.get(chapter.id)}`,
          chapter.relativePath
        )
      );
      continue;
    }

    idMap.set(chapter.id, chapter.relativePath);
  }

  chapters.sort((a, b) => {
    if (a.order == null && b.order == null) {
      return a.relativePath.localeCompare(b.relativePath);
    }
    if (a.order == null) {
      return 1;
    }
    if (b.order == null) {
      return -1;
    }
    return a.order - b.order;
  });

  return {
    chapters,
    issues
  };
}

function collectContentFiles(rootDir: string): { leafFiles: string[]; branchFiles: string[] } {
  const leafFiles: string[] = [];
  const branchFiles: string[] = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    const entries = fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (isBranchFile(fullPath)) {
        branchFiles.push(fullPath);
        continue;
      }

      if (isSupportedLeafContentFile(fullPath)) {
        leafFiles.push(fullPath);
      }
    }
  }

  return {
    leafFiles: leafFiles.sort(),
    branchFiles: branchFiles.sort()
  };
}

function validateBranchFile(filePath: string, repoRoot: string): Issue[] {
  const relativePath = path.relative(repoRoot, filePath);
  let raw = "";
  try {
    raw = fs.readFileSync(filePath, "utf8");
    parseBranchDocument(raw, relativePath);
    return [];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return [makeIssue("error", "metadata", message, relativePath)];
  }
}

export function issueHasErrors(issues: Issue[]): boolean {
  return issues.some((issue) => issue.level === "error");
}

export function formatIssues(issues: Issue[]): string[] {
  return issues.map((issue) => {
    const filePart = issue.file ? ` ${issue.file}` : "";
    const linePart = issue.line ? `:${issue.line}` : "";
    return `[${issue.level.toUpperCase()}][${issue.category}]${filePart}${linePart} ${issue.message}`;
  });
}

function parseChapter(
  chapterPath: string,
  project: ProjectContext,
  effectiveLeafPolicy: EffectiveBranchLeafPolicy
): ChapterEntry {
  const repoRoot = project.workspace.repoRoot;
  const runtimeConfig = project.workspace.config;
  const relativePath = path.relative(repoRoot, chapterPath);
  const raw = fs.readFileSync(chapterPath, "utf8");
  const { metadata, body, comments, issues } = parseMetadata(raw, chapterPath, repoRoot, false);
  const chapterIssues = [...issues];
  const effectiveMetadata = applyLeafPolicyDefaults(metadata as FrontmatterRecord, effectiveLeafPolicy);

  for (const requiredKey of effectiveLeafPolicy.requiredMetadata) {
    if (effectiveMetadata[requiredKey] == null || effectiveMetadata[requiredKey] === "") {
      chapterIssues.push(
        makeIssue(
          "warning",
          "metadata",
          `Missing required metadata key '${requiredKey}'. Validation and stage checks that depend on '${requiredKey}' are skipped for this file.`,
          relativePath
        )
      );
    }
  }

  const title = deriveEntryTitle(effectiveMetadata.title, chapterPath);
  if (effectiveMetadata.order != null && effectiveMetadata.order !== "") {
    chapterIssues.push(
      makeIssue(
        "warning",
        "metadata",
        "Metadata 'order' is ignored. Use template logic for ordering; numeric filename prefixes are optional ordering hints only.",
        relativePath
      )
    );
  }

  const order = parseOrderFromFilename(chapterPath, relativePath, chapterIssues);
  const status = String(effectiveMetadata.status || "").trim();
  if (status && !isStageName(status)) {
    chapterIssues.push(makeIssue("error", "metadata", `Invalid file status '${status}'. Allowed: ${runtimeConfig.allowedStatuses.join(", ")}.`, relativePath));
  }

  const leafId = typeof effectiveMetadata.id === "string" ? effectiveMetadata.id.trim() : "";
  if (!leafId) {
    chapterIssues.push(makeIssue("error", "metadata", "Missing required leaf id.", relativePath));
  } else if (!isValidLeafId(leafId)) {
    chapterIssues.push(makeIssue("error", "metadata", `Invalid leaf id '${leafId}'.`, relativePath));
  }
  chapterIssues.push(...validateImagesMetadata(effectiveMetadata, relativePath));
  chapterIssues.push(...validateMarkdownBody(body, chapterPath, repoRoot, project.root));

  return {
    path: chapterPath,
    relativePath,
    id: leafId || null,
    title,
    order,
    status,
    metadata: effectiveMetadata,
    body,
    comments,
    issues: chapterIssues
  };
}

function resolveEffectiveLeafPolicyForPath(
  chapterPath: string,
  contentDir: string,
  branchLeafPolicyByDir: Map<string, BranchLeafPolicy>
): EffectiveBranchLeafPolicy {
  let effectiveLeafPolicy = createEmptyEffectiveBranchLeafPolicy();

  const contentRoot = path.resolve(contentDir);
  let currentDir = path.resolve(path.dirname(chapterPath));
  const ancestorDirs: string[] = [];
  while (true) {
    const relative = path.relative(contentRoot, currentDir);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      break;
    }
    ancestorDirs.push(currentDir);
    if (currentDir === contentRoot) {
      break;
    }
    currentDir = path.dirname(currentDir);
  }

  ancestorDirs.reverse();
  for (const dirPath of ancestorDirs) {
    effectiveLeafPolicy = mergeBranchLeafPolicy(
      effectiveLeafPolicy,
      branchLeafPolicyByDir.get(dirPath)
    );
  }

  return effectiveLeafPolicy;
}

function deriveEntryTitle(rawTitle: unknown, chapterPath: string): string {
  if (typeof rawTitle === "string" && rawTitle.trim()) {
    return rawTitle.trim();
  }
  const basename = path.basename(chapterPath, ".md");
  const withoutPrefix = basename.replace(/^\d+[-_]?/, "");
  const normalized = withoutPrefix.replace(/[-_]+/g, " ").trim();
  if (!normalized) {
    return basename;
  }
  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function parseOrderFromFilename(chapterPath: string, relativePath: string, issues: Issue[]): number | null {
  const basename = path.basename(chapterPath, ".md");
  const match = basename.match(/^(\d+)[-_]/);
  if (!match) {
    return null;
  }
  return Number(match[1]);
}

function validateImagesMetadata(metadata: MetadataRecord, relativePath: string): Issue[] {
  const issues: Issue[] = [];
  const rawImages = metadata.images;
  if (rawImages == null) {
    return issues;
  }

  if (!isPlainObject(rawImages)) {
    issues.push(makeIssue("warning", "metadata", "Metadata 'images' must be an object.", relativePath));
    return issues;
  }

  const reservedGlobalKeys = new Set(["width", "height", "classes", "id", "attrs", "layout", "align"]);
  for (const [key, value] of Object.entries(rawImages)) {
    if (reservedGlobalKeys.has(key)) {
      issues.push(
        makeIssue(
          "warning",
          "metadata",
          `Leaf frontmatter 'images.${key}' is reserved for project defaults. Put defaults in stego-project.json 'images.${key}'.`,
          relativePath
        )
      );
      continue;
    }

    if (!isPlainObject(value)) {
      issues.push(
        makeIssue(
          "warning",
          "metadata",
          `Metadata 'images.${key}' must be an object of style keys (width, height, classes, id, attrs, layout, align).`,
          relativePath
        )
      );
      continue;
    }

    for (const [styleKey, styleValue] of Object.entries(value)) {
      issues.push(...validateImageStyleField(styleValue, styleKey, `images.${key}.${styleKey}`, relativePath));
    }
  }

  return issues;
}

function validateProjectImagesConfiguration(project: ProjectContext): Issue[] {
  const issues: Issue[] = [];
  const rawImages = project.meta.images;
  const projectConfigPath = path.relative(project.workspace.repoRoot, path.join(project.root, "stego-project.json"));
  if (rawImages == null) {
    return issues;
  }

  if (!isPlainObject(rawImages)) {
    issues.push(makeIssue("warning", "metadata", "Project 'images' must be an object.", projectConfigPath));
    return issues;
  }

  const reservedGlobalKeys = new Set(["width", "height", "classes", "id", "attrs", "layout", "align"]);
  for (const [key, value] of Object.entries(rawImages)) {
    if (reservedGlobalKeys.has(key)) {
      issues.push(...validateImageStyleField(value, key, `images.${key}`, projectConfigPath));
      continue;
    }

    issues.push(
      makeIssue(
        "warning",
        "metadata",
        `Project image defaults do not support key 'images.${key}'. Use only width, height, classes, id, attrs, layout, align in stego-project.json.`,
        projectConfigPath
      )
    );
  }

  return issues;
}

function validateImageStyleField(
  value: unknown,
  key: string,
  metadataPath: string,
  relativePath: string
): Issue[] {
  const issues: Issue[] = [];

  if (key === "width" || key === "height" || key === "id") {
    if (!isStyleScalar(value)) {
      issues.push(makeIssue("warning", "metadata", `Metadata '${metadataPath}' must be a scalar value.`, relativePath));
    }
    return issues;
  }

  if (key === "classes") {
    if (typeof value === "string") {
      return issues;
    }
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.trim().length === 0)) {
      issues.push(makeIssue("warning", "metadata", `Metadata '${metadataPath}' must be a string or array of strings.`, relativePath));
    }
    return issues;
  }

  if (key === "attrs") {
    if (!isPlainObject(value)) {
      issues.push(makeIssue("warning", "metadata", `Metadata '${metadataPath}' must be an object of scalar values.`, relativePath));
      return issues;
    }
    for (const [attrKey, attrValue] of Object.entries(value)) {
      if (!isStyleScalar(attrValue)) {
        issues.push(
          makeIssue(
            "warning",
            "metadata",
            `Metadata '${metadataPath}.${attrKey}' must be a scalar value.`,
            relativePath
          )
        );
      }
    }
    return issues;
  }

  if (key === "layout") {
    if (value !== "block" && value !== "inline") {
      issues.push(makeIssue("warning", "metadata", `Metadata '${metadataPath}' must be either 'block' or 'inline'.`, relativePath));
    }
    return issues;
  }

  if (key === "align") {
    if (value !== "left" && value !== "center" && value !== "right") {
      issues.push(makeIssue("warning", "metadata", `Metadata '${metadataPath}' must be one of: left, center, right.`, relativePath));
    }
    return issues;
  }

  issues.push(
    makeIssue(
      "warning",
      "metadata",
      `Unsupported image style key '${key}' in '${metadataPath}'. Allowed keys: width, height, classes, id, attrs, layout, align.`,
      relativePath
    )
  );
  return issues;
}

function isStyleScalar(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function parseMetadata(raw: string, chapterPath: string, repoRoot: string, required: boolean): {
  metadata: MetadataRecord;
  body: string;
  comments: ParsedCommentThread[];
  issues: Issue[];
} {
  const relativePath = path.relative(repoRoot, chapterPath);
  const issues: Issue[] = [];
  const frontmatterMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if ((raw.startsWith("---\n") || raw.startsWith("---\r\n")) && !frontmatterMatch) {
    return {
      metadata: {},
      body: raw,
      comments: [],
      issues: [makeIssue("error", "metadata", "Metadata opening delimiter found, but closing delimiter is missing.", relativePath)]
    };
  }

  let parsed;
  try {
    parsed = parseMarkdownDocument(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      metadata: {},
      body: raw,
      comments: [],
      issues: [makeIssue("error", "metadata", `Could not parse frontmatter: ${message}`, relativePath)]
    };
  }

  if (!parsed.hasFrontmatter && required) {
    issues.push(makeIssue("error", "metadata", "Missing metadata block at top of file.", relativePath));
  }

  const bodyStartLine = frontmatterMatch
    ? frontmatterMatch[0].split(/\r?\n/).length
    : 1;
  const commentsResult = parseStegoCommentsAppendix(parsed.body, relativePath, bodyStartLine);
  issues.push(...commentsResult.issues);
  return {
    metadata: parsed.frontmatter as MetadataRecord,
    body: commentsResult.bodyWithoutComments,
    comments: commentsResult.comments,
    issues
  };
}

function parseStegoCommentsAppendix(
  body: string,
  relativePath: string,
  bodyStartLine: number
): { bodyWithoutComments: string; comments: ParsedCommentThread[]; issues: Issue[] } {
  const parsed = parseCommentAppendix(body);
  const issues = parsed.errors.map((error) => parseCommentIssueFromParserError(error, relativePath, bodyStartLine));
  const comments = parsed.comments.map((comment) => ({
    id: comment.id,
    resolved: comment.status === "resolved",
    thread: comment.thread
  }));

  return {
    bodyWithoutComments: parsed.contentWithoutComments,
    comments,
    issues
  };
}

function parseCommentIssueFromParserError(error: string, relativePath: string, bodyStartLine: number): Issue {
  const lineMatch = error.match(/^Line\s+(\d+):\s+([\s\S]+)$/);
  if (!lineMatch) {
    return makeIssue("error", "comments", error, relativePath);
  }

  const relativeLine = Number.parseInt(lineMatch[1], 10);
  const absoluteLine = Number.isFinite(relativeLine) ? bodyStartLine + relativeLine - 1 : undefined;
  return makeIssue("error", "comments", lineMatch[2], relativePath, absoluteLine);
}

function validateMarkdownBody(body: string, chapterPath: string, repoRoot: string, projectRoot: string): Issue[] {
  const relativePath = path.relative(repoRoot, chapterPath);
  const issues: Issue[] = [];
  const lines = body.split(/\r?\n/);
  let openFence: { marker: string; length: number; line: number } | null = null;
  let previousHeadingLevel = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const fenceMatch = line.match(/^(```+|~~~+)/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      const length = fenceMatch[1].length;
      if (!openFence) {
        openFence = { marker, length, line: i + 1 };
      } else if (openFence.marker === marker && length >= openFence.length) {
        openFence = null;
      }
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      if (previousHeadingLevel > 0 && level > previousHeadingLevel + 1) {
        issues.push(makeIssue("warning", "style", `Heading level jumps from H${previousHeadingLevel} to H${level}.`, relativePath, i + 1));
      }
      previousHeadingLevel = level;
    }

    if (/\[[^\]]+\]\([^\)]*$/.test(line.trim())) {
      issues.push(makeIssue("error", "structure", "Malformed markdown link, missing closing ')'.", relativePath, i + 1));
    }
  }

  if (openFence) {
    issues.push(makeIssue("error", "structure", `Unclosed code fence opened at line ${openFence.line}.`, relativePath, openFence.line));
  }

  issues.push(...checkLocalMarkdownLinks(body, chapterPath, repoRoot, projectRoot));
  issues.push(...runStyleHeuristics(body, relativePath));
  return issues;
}

function checkLocalMarkdownLinks(body: string, chapterPath: string, repoRoot: string, projectRoot: string): Issue[] {
  const relativePath = path.relative(repoRoot, chapterPath);
  const issues: Issue[] = [];
  const assetsDir = path.resolve(projectRoot, "assets");
  const warnedOutsideAssets = new Set<string>();
  const linkRegex = /(!?)\[[^\]]*\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null = null;
  while ((match = linkRegex.exec(body)) !== null) {
    const isImage = match[1] === "!";
    let target = match[2].trim();
    if (!target) {
      continue;
    }
    if (target.startsWith("<") && target.endsWith(">")) {
      target = target.slice(1, -1).trim();
    }
    target = target.split(/\s+"/)[0].split(/\s+'/)[0].trim();
    if (isExternalTarget(target) || target.startsWith("#")) {
      continue;
    }
    const cleanTarget = target.split("#")[0].split("?")[0];
    if (!cleanTarget) {
      continue;
    }
    const resolved = path.resolve(path.dirname(chapterPath), cleanTarget);
    if (!fs.existsSync(resolved)) {
      issues.push(makeIssue("warning", "links", `Broken local link/image target '${cleanTarget}'.`, relativePath));
    }

    if (!isImage) {
      continue;
    }

    if (isPathInside(resolved, assetsDir)) {
      continue;
    }

    const warningKey = `${relativePath}|${cleanTarget}`;
    if (warnedOutsideAssets.has(warningKey)) {
      continue;
    }
    warnedOutsideAssets.add(warningKey);
    issues.push(
      makeIssue(
        "warning",
        "assets",
        `Local image target '${cleanTarget}' is outside project assets/. Store leaf images under 'assets/'.`,
        relativePath
      )
    );
  }
  return issues;
}

function isExternalTarget(target: string): boolean {
  return (
    target.startsWith("http://")
    || target.startsWith("https://")
    || target.startsWith("data:")
    || target.startsWith("mailto:")
    || target.startsWith("tel:")
  );
}

function isPathInside(candidatePath: string, parentPath: string): boolean {
  const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  if (!relative) {
    return true;
  }
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

function runStyleHeuristics(body: string, relativePath: string): Issue[] {
  const issues: Issue[] = [];
  const prose = body
    .replace(/```[\s\S]*?```/g, "")
    .replace(/~~~[\s\S]*?~~~/g, "");

  const paragraphs = prose
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .filter((paragraph) => !paragraph.startsWith("#"))
    .filter((paragraph) => !paragraph.startsWith("- "));

  for (const paragraph of paragraphs) {
    const words = countWords(paragraph);
    if (words > 180) {
      issues.push(makeIssue("warning", "style", `Long paragraph detected (${words} words).`, relativePath));
    }
    const sentences = paragraph.split(/[.!?]+\s+/).map((sentence) => sentence.trim()).filter(Boolean);
    for (const sentence of sentences) {
      const sentenceWords = countWords(sentence);
      if (sentenceWords > 45) {
        issues.push(makeIssue("warning", "style", `Long sentence detected (${sentenceWords} words).`, relativePath));
      }
    }
  }
  return issues;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function makeIssue(
  level: IssueLevel,
  category: string,
  message: string,
  file: string | null = null,
  line: number | null = null
): Issue {
  return { level, category, message, file, line };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

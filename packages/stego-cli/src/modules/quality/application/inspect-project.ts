import fs from "node:fs";
import path from "node:path";
import { parseCommentAppendix } from "../../../../../shared/src/domain/comments/index.ts";
import { parseMarkdownDocument } from "../../../../../shared/src/domain/frontmatter/index.ts";
import { isStageName } from "../../../../../shared/src/domain/stages/index.ts";
import { readSpineCatalogForProject } from "../../spine/index.ts";
import type {
  ChapterEntry,
  CompileStructureLevel,
  CompileStructureResult,
  InspectProjectOptions,
  Issue,
  IssueLevel,
  MetadataRecord,
  ParsedCommentThread,
  ProjectInspection,
  RequiredMetadataResult,
  SpineCategory,
  SpineState
} from "../types.ts";
import type { ProjectContext } from "../../project/index.ts";

export function inspectProject(
  project: ProjectContext,
  options: InspectProjectOptions = {}
): ProjectInspection {
  const repoRoot = project.workspace.repoRoot;
  const runtimeConfig = project.workspace.config;
  const issues: Issue[] = [];
  const emptySpineState: SpineState = { categories: [], entriesByCategory: new Map<string, Set<string>>(), issues: [] };
  const requiredMetadataState = resolveRequiredMetadata(project);
  const compileStructureState = resolveCompileStructure(project);
  issues.push(...requiredMetadataState.issues);
  issues.push(...compileStructureState.issues);
  issues.push(...validateProjectImagesConfiguration(project));

  if (project.meta.spineCategories !== undefined) {
    issues.push(
      makeIssue(
        "error",
        "metadata",
        "Legacy 'spineCategories' in stego-project.json is no longer supported. Use spine/ category directories and files.",
        path.relative(repoRoot, path.join(project.root, "stego-project.json"))
      )
    );
  }

  const spineState = readSpine(project);
  issues.push(...spineState.issues);

  let chapterFiles: string[] = [];
  const onlyFile = options.onlyFile?.trim();
  if (onlyFile) {
    const resolvedPath = path.resolve(project.root, onlyFile);
    const relativeToProject = path.relative(project.root, resolvedPath);
    if (!relativeToProject || relativeToProject.startsWith("..") || path.isAbsolute(relativeToProject)) {
      issues.push(
        makeIssue("error", "structure", `Requested file is outside the project: ${onlyFile}`, null)
      );
      return { chapters: [], issues, spineState: emptySpineState, compileStructureLevels: compileStructureState.levels };
    }

    if (!fs.existsSync(resolvedPath)) {
      issues.push(makeIssue("error", "structure", `Requested file does not exist: ${onlyFile}`, null));
      return { chapters: [], issues, spineState: emptySpineState, compileStructureLevels: compileStructureState.levels };
    }

    if (!fs.statSync(resolvedPath).isFile() || !resolvedPath.endsWith(".md")) {
      issues.push(makeIssue("error", "structure", `Requested file must be a markdown file: ${onlyFile}`, null));
      return { chapters: [], issues, spineState: emptySpineState, compileStructureLevels: compileStructureState.levels };
    }

    const relativeToManuscript = path.relative(project.manuscriptDir, resolvedPath);
    if (relativeToManuscript.startsWith("..") || path.isAbsolute(relativeToManuscript)) {
      issues.push(
        makeIssue(
          "error",
          "structure",
          `Requested file must be inside manuscript directory: ${project.manuscriptDir}`,
          null
        )
      );
      return { chapters: [], issues, spineState: emptySpineState, compileStructureLevels: compileStructureState.levels };
    }

    chapterFiles = [resolvedPath];
  } else {
    if (!fs.existsSync(project.manuscriptDir)) {
      issues.push(makeIssue("error", "structure", `Missing manuscript directory: ${project.manuscriptDir}`));
      return { chapters: [], issues, spineState: emptySpineState, compileStructureLevels: compileStructureState.levels };
    }

    chapterFiles = fs
      .readdirSync(project.manuscriptDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => path.join(project.manuscriptDir, entry.name))
      .sort();

    if (chapterFiles.length === 0) {
      issues.push(makeIssue("error", "structure", `No manuscript files found in ${project.manuscriptDir}`));
      return { chapters: [], issues, spineState: emptySpineState, compileStructureLevels: compileStructureState.levels };
    }
  }

  const chapters = chapterFiles.map((chapterPath) =>
    parseChapter(
      chapterPath,
      project,
      requiredMetadataState.requiredMetadata,
      spineState.categories,
      compileStructureState.levels
    )
  );

  for (const chapter of chapters) {
    issues.push(...chapter.issues);
  }

  const orderMap = new Map<number, string>();
  for (const chapter of chapters) {
    if (chapter.order == null) {
      continue;
    }

    if (orderMap.has(chapter.order)) {
      issues.push(
        makeIssue(
          "error",
          "ordering",
          `Duplicate filename order prefix '${chapter.order}' in ${chapter.relativePath} and ${orderMap.get(chapter.order)}`,
          chapter.relativePath
        )
      );
      continue;
    }

    orderMap.set(chapter.order, chapter.relativePath);
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

  for (const chapter of chapters) {
    issues.push(
      ...findUnknownSpineReferences(chapter.referenceKeysByCategory, spineState.entriesByCategory, chapter.relativePath)
    );
  }

  return {
    chapters,
    issues,
    spineState,
    compileStructureLevels: compileStructureState.levels
  };
}

export function resolveRequiredMetadata(project: ProjectContext): RequiredMetadataResult {
  const repoRoot = project.workspace.repoRoot;
  const runtimeConfig = project.workspace.config;
  const issues: Issue[] = [];
  const projectFile = path.relative(repoRoot, path.join(project.root, "stego-project.json"));
  const raw = project.meta.requiredMetadata;

  if (raw == null) {
    return { requiredMetadata: runtimeConfig.requiredMetadata, issues };
  }

  if (!Array.isArray(raw)) {
    issues.push(
      makeIssue(
        "error",
        "metadata",
        "Project 'requiredMetadata' must be an array of metadata keys.",
        projectFile
      )
    );
    return { requiredMetadata: runtimeConfig.requiredMetadata, issues };
  }

  const requiredMetadata: string[] = [];
  const seen = new Set<string>();

  for (const [index, entry] of raw.entries()) {
    if (typeof entry !== "string") {
      issues.push(
        makeIssue(
          "error",
          "metadata",
          `Project 'requiredMetadata' entry at index ${index} must be a string.`,
          projectFile
        )
      );
      continue;
    }

    const key = entry.trim();
    if (!key) {
      issues.push(
        makeIssue(
          "error",
          "metadata",
          `Project 'requiredMetadata' entry at index ${index} cannot be empty.`,
          projectFile
        )
      );
      continue;
    }

    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    requiredMetadata.push(key);
  }

  return { requiredMetadata, issues };
}

export function resolveCompileStructure(project: ProjectContext): CompileStructureResult {
  const repoRoot = project.workspace.repoRoot;
  const issues: Issue[] = [];
  const projectFile = path.relative(repoRoot, path.join(project.root, "stego-project.json"));
  const raw = project.meta.compileStructure;

  if (raw == null) {
    return { levels: [], issues };
  }

  if (!isPlainObject(raw)) {
    issues.push(makeIssue("error", "metadata", "Project 'compileStructure' must be an object.", projectFile));
    return { levels: [], issues };
  }

  const rawLevels = raw.levels;
  if (!Array.isArray(rawLevels)) {
    issues.push(makeIssue("error", "metadata", "Project 'compileStructure.levels' must be an array.", projectFile));
    return { levels: [], issues };
  }

  const levels: CompileStructureLevel[] = [];
  const seenKeys = new Set<string>();
  for (const [index, entry] of rawLevels.entries()) {
    if (!isPlainObject(entry)) {
      issues.push(makeIssue("error", "metadata", `Invalid compileStructure level at index ${index}. Expected object.`, projectFile));
      continue;
    }

    const key = typeof entry.key === "string" ? entry.key.trim() : "";
    const label = typeof entry.label === "string" ? entry.label.trim() : "";
    const titleKeyRaw = typeof entry.titleKey === "string" ? entry.titleKey.trim() : "";
    const headingTemplateRaw = typeof entry.headingTemplate === "string" ? entry.headingTemplate.trim() : "";

    if (!key || !/^[a-z][a-z0-9_-]*$/.test(key)) {
      issues.push(makeIssue("error", "metadata", `compileStructure.levels[${index}].key must match /^[a-z][a-z0-9_-]*$/.`, projectFile));
      continue;
    }
    if (!label) {
      issues.push(makeIssue("error", "metadata", `compileStructure.levels[${index}].label is required.`, projectFile));
      continue;
    }
    if (seenKeys.has(key)) {
      issues.push(makeIssue("error", "metadata", `Duplicate compileStructure level key '${key}'.`, projectFile));
      continue;
    }
    if (titleKeyRaw && !/^[a-z][a-z0-9_-]*$/.test(titleKeyRaw)) {
      issues.push(makeIssue("error", "metadata", `compileStructure.levels[${index}].titleKey must match /^[a-z][a-z0-9_-]*$/.`, projectFile));
      continue;
    }

    const pageBreakRaw = typeof entry.pageBreak === "string" ? entry.pageBreak.trim() : "between-groups";
    if (pageBreakRaw !== "none" && pageBreakRaw !== "between-groups") {
      issues.push(makeIssue("error", "metadata", `compileStructure.levels[${index}].pageBreak must be 'none' or 'between-groups'.`, projectFile));
      continue;
    }

    const injectHeading = typeof entry.injectHeading === "boolean" ? entry.injectHeading : true;
    const headingTemplate = headingTemplateRaw || "{label} {value}: {title}";
    seenKeys.add(key);
    levels.push({
      key,
      label,
      titleKey: titleKeyRaw || undefined,
      injectHeading,
      headingTemplate,
      pageBreak: pageBreakRaw
    });
  }

  return { levels, issues };
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
  requiredMetadata: string[],
  spineCategories: SpineCategory[],
  compileStructureLevels: CompileStructureLevel[]
): ChapterEntry {
  const repoRoot = project.workspace.repoRoot;
  const runtimeConfig = project.workspace.config;
  const relativePath = path.relative(repoRoot, chapterPath);
  const raw = fs.readFileSync(chapterPath, "utf8");
  const { metadata, body, comments, issues } = parseMetadata(raw, chapterPath, repoRoot, false);
  const chapterIssues = [...issues];

  for (const requiredKey of requiredMetadata) {
    if (metadata[requiredKey] == null || metadata[requiredKey] === "") {
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

  const title = deriveEntryTitle(metadata.title, chapterPath);
  if (metadata.order != null && metadata.order !== "") {
    chapterIssues.push(makeIssue("warning", "metadata", "Metadata 'order' is ignored. Ordering is derived from filename prefix.", relativePath));
  }

  const order = parseOrderFromFilename(chapterPath, relativePath, chapterIssues);
  const status = String(metadata.status || "").trim();
  if (status && !isStageName(status)) {
    chapterIssues.push(makeIssue("error", "metadata", `Invalid file status '${status}'. Allowed: ${runtimeConfig.allowedStatuses.join(", ")}.`, relativePath));
  }

  const groupValues: Record<string, string> = {};
  for (const level of compileStructureLevels) {
    const groupValue = normalizeGroupingValue(metadata[level.key], relativePath, chapterIssues, level.key);
    if (groupValue) {
      groupValues[level.key] = groupValue;
    }
    if (level.titleKey) {
      void normalizeGroupingValue(metadata[level.titleKey], relativePath, chapterIssues, level.titleKey);
    }
  }

  const referenceValidation = extractReferenceKeysByCategory(metadata, relativePath, spineCategories);
  chapterIssues.push(...referenceValidation.issues);
  chapterIssues.push(...validateImagesMetadata(metadata, relativePath));
  chapterIssues.push(...validateMarkdownBody(body, chapterPath, repoRoot, project.root));

  return {
    path: chapterPath,
    relativePath,
    title,
    order,
    status,
    referenceKeysByCategory: referenceValidation.referencesByCategory,
    groupValues,
    metadata,
    body,
    comments,
    issues: chapterIssues
  };
}

function normalizeGroupingValue(
  rawValue: unknown,
  relativePath: string,
  issues: Issue[],
  key: string
): string | undefined {
  if (rawValue == null || rawValue === "") {
    return undefined;
  }
  if (Array.isArray(rawValue) || isPlainObject(rawValue)) {
    issues.push(makeIssue("error", "metadata", `Metadata '${key}' must be a scalar value.`, relativePath));
    return undefined;
  }
  const normalized = String(rawValue).trim();
  return normalized.length > 0 ? normalized : undefined;
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
    issues.push(makeIssue("error", "ordering", "Filename must start with a numeric prefix followed by '-' or '_' (for example '100-scene.md').", relativePath));
    return null;
  }
  if (match[1].length !== 3) {
    issues.push(makeIssue("warning", "ordering", `Filename prefix '${match[1]}' is valid but non-standard. Use three digits like 100, 200, 300.`, relativePath));
  }
  return Number(match[1]);
}

function extractReferenceKeysByCategory(
  metadata: MetadataRecord,
  relativePath: string,
  spineCategories: SpineCategory[]
): { referencesByCategory: Record<string, string[]>; issues: Issue[] } {
  const issues: Issue[] = [];
  const referencesByCategory: Record<string, string[]> = {};

  for (const category of spineCategories) {
    const rawValue = metadata[category.key];
    if (rawValue == null || rawValue === "") {
      continue;
    }

    if (!Array.isArray(rawValue)) {
      issues.push(makeIssue("error", "metadata", `Metadata '${category.key}' must be an array of spine entry keys (for example: [\"matthaeus\"]).`, relativePath));
      continue;
    }

    const seen = new Set<string>();
    const values: string[] = [];
    for (const entry of rawValue) {
      if (typeof entry !== "string") {
        issues.push(makeIssue("error", "metadata", `Metadata '${category.key}' entries must be strings.`, relativePath));
        continue;
      }
      const normalized = entry.trim();
      if (!normalized) {
        issues.push(makeIssue("error", "metadata", `Metadata '${category.key}' contains an empty entry key.`, relativePath));
        continue;
      }
      if (seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      values.push(normalized);
    }
    referencesByCategory[category.key] = values;
  }

  return { referencesByCategory, issues };
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
          `Manuscript frontmatter 'images.${key}' is reserved for project defaults. Put defaults in stego-project.json 'images.${key}'.`,
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
        `Local image target '${cleanTarget}' is outside project assets/. Store manuscript images under 'assets/'.`,
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

function readSpine(project: ProjectContext): SpineState {
  const catalogEnvelope = readSpineCatalogForProject(project);
  const categories: SpineCategory[] = [];
  const entriesByCategory = new Map<string, Set<string>>();

  for (const category of catalogEnvelope.state.categories) {
    const entries = new Set<string>(category.entries.map((entry) => entry.key));
    categories.push({ key: category.key, entries });
    entriesByCategory.set(category.key, entries);
  }

  const issues = catalogEnvelope.state.issues.map((message) => makeIssue("warning", "continuity", message));
  return { categories, entriesByCategory, issues };
}

function findUnknownSpineReferences(
  referencesByCategory: Record<string, string[]>,
  entriesByCategory: Map<string, Set<string>>,
  relativePath: string
): Issue[] {
  const issues: Issue[] = [];
  for (const [categoryKey, values] of Object.entries(referencesByCategory)) {
    const known = entriesByCategory.get(categoryKey);
    if (!known) {
      issues.push(makeIssue("warning", "continuity", `Metadata category '${categoryKey}' has references but no matching spine category directory was found in spine/.`, relativePath));
      continue;
    }
    for (const value of values) {
      if (known.has(value)) {
        continue;
      }
      issues.push(makeIssue("warning", "continuity", `Metadata reference '${categoryKey}: ${value}' does not exist in spine/${categoryKey}/.`, relativePath));
    }
  }
  return issues;
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

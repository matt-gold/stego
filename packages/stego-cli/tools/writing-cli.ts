#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { markdownExporter } from "./exporters/markdown-exporter.ts";
import { createPandocExporter } from "./exporters/pandoc-exporter.ts";
import type { ExportFormat, Exporter } from "./exporters/exporter-types.ts";

type StageName = "draft" | "revise" | "line-edit" | "proof" | "final";
type IssueLevel = "error" | "warning";
type MetadataValue = string | number | boolean | string[];

interface Issue {
  level: IssueLevel;
  category: string;
  message: string;
  file: string | null;
  line: number | null;
}

interface ParsedOptions {
  _: string[];
  [key: string]: string | boolean | string[] | undefined;
}

interface ParseArgsResult {
  command: string | undefined;
  options: ParsedOptions;
}

interface StagePolicy {
  minimumChapterStatus: StageName;
  requireStoryBible: boolean;
  enforceMarkdownlint: boolean;
  enforceCSpell: boolean;
  enforceLocalLinks: boolean;
}

interface WritingConfig {
  projectsDir: string;
  chapterDir: string;
  storyBibleDir: string;
  notesDir: string;
  distDir: string;
  requiredMetadata: string[];
  allowedStatuses: StageName[];
  stagePolicies: Record<StageName, StagePolicy>;
}

interface ProjectMeta {
  id?: string;
  title?: string;
  subtitle?: string;
  author?: string;
  requiredMetadata?: unknown;
  bibleCategories?: unknown;
  [key: string]: unknown;
}

interface BibleCategory {
  key: string;
  prefix: string;
  notesFile: string;
  idPattern: RegExp;
}

interface ProjectContext {
  id: string;
  root: string;
  manuscriptDir: string;
  storyBibleDir: string;
  notesDir: string;
  distDir: string;
  meta: ProjectMeta;
}

type Metadata = Record<string, MetadataValue | undefined>;

interface ChapterEntry {
  path: string;
  relativePath: string;
  title: string;
  order: number | null;
  chapterNumber: number | null;
  chapterTitle: string;
  status: string;
  referenceIds: string[];
  metadata: Metadata;
  body: string;
  issues: Issue[];
}

interface StoryBibleState {
  ids: Set<string>;
  issues: Issue[];
}

interface ProjectInspection {
  chapters: ChapterEntry[];
  issues: Issue[];
  bibleState: StoryBibleState;
}

interface InspectProjectOptions {
  onlyFile?: string;
}

interface ParseMetadataResult {
  metadata: Metadata;
  body: string;
  issues: Issue[];
}

interface ChapterSection {
  chapterNumber: number | null;
  chapterTitle: string;
  entries: ChapterEntry[];
}

interface BibleSchema {
  categories: BibleCategory[];
  inlineIdRegex: RegExp | null;
}

const STATUS_RANK: Record<StageName, number> = {
  draft: 0,
  revise: 1,
  "line-edit": 2,
  proof: 3,
  final: 4
};
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const configPath = path.join(repoRoot, "writing.config.json");
const config = readJson<WritingConfig>(configPath);

main();

function main(): void {
  const { command, options } = parseArgs(process.argv.slice(2));

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printUsage();
    return;
  }

  try {
    switch (command) {
      case "list-projects":
        listProjects();
        return;
      case "new-project":
        createProject(readStringOption(options, "project"), readStringOption(options, "title"));
        return;
      case "validate": {
        const project = resolveProject(readStringOption(options, "project"));
        const report = inspectProject(project, config, { onlyFile: readStringOption(options, "file") });
        printReport(report.issues);
        exitIfErrors(report.issues);
        if (report.chapters.length === 1) {
          logLine(`Validation passed for '${report.chapters[0].relativePath}'.`);
        } else {
          logLine(`Validation passed for '${project.id}'.`);
        }
        return;
      }
      case "build": {
        const project = resolveProject(readStringOption(options, "project"));
        const report = inspectProject(project, config);
        printReport(report.issues);
        exitIfErrors(report.issues);
        const outputPath = buildManuscript(project, report.chapters);
        logLine(`Build output: ${outputPath}`);
        return;
      }
      case "check-stage": {
        const project = resolveProject(readStringOption(options, "project"));
        const stage = readStringOption(options, "stage") || "draft";
        const requestedFile = readStringOption(options, "file");
        const report = runStageCheck(project, config, stage, requestedFile);
        printReport(report.issues);
        exitIfErrors(report.issues);
        if (requestedFile && report.chapters.length === 1) {
          logLine(`Stage check passed for '${report.chapters[0].relativePath}' at stage '${stage}'.`);
        } else {
          logLine(`Stage check passed for '${project.id}' at stage '${stage}'.`);
        }
        return;
      }
      case "export": {
        const project = resolveProject(readStringOption(options, "project"));
        const format = (readStringOption(options, "format") || "md").toLowerCase();
        const report = inspectProject(project, config);
        printReport(report.issues);
        exitIfErrors(report.issues);
        const inputPath = buildManuscript(project, report.chapters);
        const outputPath = runExport(project, format, inputPath, readStringOption(options, "output"));
        logLine(`Export output: ${outputPath}`);
        return;
      }
      default:
        throw new Error(`Unknown command '${command}'. Run with 'help' for usage.`);
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error(`ERROR: ${error.message}`);
    } else {
      console.error(`ERROR: ${String(error)}`);
    }
    process.exit(1);
  }
}

function readStringOption(options: ParsedOptions, key: string): string | undefined {
  const value = options[key];
  return typeof value === "string" ? value : undefined;
}

function isStageName(value: string): value is StageName {
  return Object.hasOwn(STATUS_RANK, value);
}

function isExportFormat(value: string): value is ExportFormat {
  return value === "md" || value === "docx" || value === "pdf" || value === "epub";
}

function resolveBibleSchema(project: ProjectContext): { schema: BibleSchema; issues: Issue[] } {
  const issues: Issue[] = [];
  const projectFile = path.relative(repoRoot, path.join(project.root, "project.json"));
  const rawCategories = project.meta.bibleCategories;

  if (rawCategories == null) {
    return { schema: { categories: [], inlineIdRegex: null }, issues };
  }

  if (!Array.isArray(rawCategories)) {
    issues.push(
      makeIssue(
        "error",
        "metadata",
        "Project 'bibleCategories' must be an array when defined.",
        projectFile
      )
    );
    return { schema: { categories: [], inlineIdRegex: null }, issues };
  }

  const categories: BibleCategory[] = [];
  const keySet = new Set<string>();
  const prefixSet = new Set<string>();
  const notesSet = new Set<string>();

  for (const [index, categoryEntry] of rawCategories.entries()) {
    if (!isPlainObject(categoryEntry)) {
      issues.push(
        makeIssue(
          "error",
          "metadata",
          `Invalid bibleCategories entry at index ${index}. Expected object with key, prefix, notesFile.`,
          projectFile
        )
      );
      continue;
    }

    const key = typeof categoryEntry.key === "string" ? categoryEntry.key.trim() : "";
    const prefix = typeof categoryEntry.prefix === "string" ? categoryEntry.prefix.trim() : "";
    const notesFile = typeof categoryEntry.notesFile === "string" ? categoryEntry.notesFile.trim() : "";

    if (!/^[a-z][a-z0-9_-]*$/.test(key)) {
      issues.push(
        makeIssue(
          "error",
          "metadata",
          `Invalid bible category key '${key || "<empty>"}'. Use lowercase key names like 'cast' or 'incidents'.`,
          projectFile
        )
      );
      continue;
    }

    if (!/^[A-Z][A-Z0-9-]*$/.test(prefix)) {
      issues.push(
        makeIssue(
          "error",
          "metadata",
          `Invalid bible category prefix '${prefix || "<empty>"}'. Use uppercase prefixes like 'CHAR' or 'STATUTE'.`,
          projectFile
        )
      );
      continue;
    }

    if (!/^[A-Za-z0-9._-]+\.md$/.test(notesFile)) {
      issues.push(
        makeIssue(
          "error",
          "metadata",
          `Invalid notesFile '${notesFile || "<empty>"}'. Use markdown filenames like 'characters.md' (resolved in story-bible/).`,
          projectFile
        )
      );
      continue;
    }

    if (keySet.has(key)) {
      issues.push(makeIssue("error", "metadata", `Duplicate bible category key '${key}'.`, projectFile));
      continue;
    }
    if (prefixSet.has(prefix)) {
      issues.push(makeIssue("error", "metadata", `Duplicate bible category prefix '${prefix}'.`, projectFile));
      continue;
    }
    if (notesSet.has(notesFile)) {
      issues.push(makeIssue("error", "metadata", `Duplicate bible category notesFile '${notesFile}'.`, projectFile));
      continue;
    }

    keySet.add(key);
    prefixSet.add(prefix);
    notesSet.add(notesFile);
    categories.push({
      key,
      prefix,
      notesFile,
      idPattern: new RegExp(`^${escapeRegex(prefix)}-[A-Z0-9-]+$`)
    });
  }

  return {
    schema: {
      categories,
      inlineIdRegex: buildInlineIdRegex(categories)
    },
    issues
  };
}

function resolveRequiredMetadata(
  project: ProjectContext,
  runtimeConfig: WritingConfig
): { requiredMetadata: string[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const projectFile = path.relative(repoRoot, path.join(project.root, "project.json"));
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

function buildInlineIdRegex(categories: BibleCategory[]): RegExp | null {
  if (categories.length === 0) {
    return null;
  }

  const prefixes = categories.map((category) => escapeRegex(category.prefix)).join("|");
  return new RegExp(`\\b(?:${prefixes})-[A-Z0-9-]+\\b`, "g");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseArgs(argv: string[]): ParseArgsResult {
  const [command, ...rest] = argv;
  const options: ParsedOptions = { _: [] };

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token.startsWith("--")) {
      options._.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = rest[i + 1];

    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }

    options[key] = next;
    i += 1;
  }

  return { command, options };
}

function printUsage() {
  console.log(`Writing CLI\n\nCommands:\n  list-projects\n  new-project --project <project-id> [--title <title>]\n  validate --project <project-id> [--file <project-relative-manuscript-path>]\n  build --project <project-id>\n  check-stage --project <project-id> --stage <draft|revise|line-edit|proof|final> [--file <project-relative-manuscript-path>]\n  export --project <project-id> --format <md|docx|pdf|epub> [--output <path>]\n`);
}

function listProjects(): void {
  const ids = getProjectIds();
  if (ids.length === 0) {
    console.log("No projects found.");
    return;
  }

  console.log("Projects:");
  for (const id of ids) {
    console.log(`- ${id}`);
  }
}

function createProject(projectIdOption?: string, titleOption?: string): void {
  const projectId = (projectIdOption || "").trim();
  if (!projectId) {
    throw new Error("Project id is required. Use --project <project-id>.");
  }

  if (!/^[a-z0-9][a-z0-9-]*$/.test(projectId)) {
    throw new Error("Project id must match /^[a-z0-9][a-z0-9-]*$/.");
  }

  const projectRoot = path.join(repoRoot, config.projectsDir, projectId);
  if (fs.existsSync(projectRoot)) {
    throw new Error(`Project already exists: ${projectRoot}`);
  }

  fs.mkdirSync(path.join(projectRoot, config.chapterDir), { recursive: true });
  const storyBibleDir = path.join(projectRoot, config.storyBibleDir);
  fs.mkdirSync(storyBibleDir, { recursive: true });
  const notesDir = path.join(projectRoot, config.notesDir);
  fs.mkdirSync(notesDir, { recursive: true });
  fs.mkdirSync(path.join(projectRoot, config.distDir), { recursive: true });

  const projectJson: Record<string, unknown> = {
    id: projectId,
    title: titleOption?.trim() || toDisplayTitle(projectId),
    requiredMetadata: ["status"],
    bibleCategories: [
      {
        key: "characters",
        prefix: "CHAR",
        notesFile: "characters.md"
      }
    ]
  };

  const projectJsonPath = path.join(projectRoot, "project.json");
  fs.writeFileSync(projectJsonPath, `${JSON.stringify(projectJson, null, 2)}\n`, "utf8");

  const projectPackage: Record<string, unknown> = {
    name: `writing-project-${projectId}`,
    private: true,
    scripts: {
      validate: "node --experimental-strip-types ../../tools/writing-cli.ts validate",
      build: "node --experimental-strip-types ../../tools/writing-cli.ts build",
      "check-stage": "node --experimental-strip-types ../../tools/writing-cli.ts check-stage",
      export: "node --experimental-strip-types ../../tools/writing-cli.ts export"
    }
  };
  const projectPackagePath = path.join(projectRoot, "package.json");
  fs.writeFileSync(projectPackagePath, `${JSON.stringify(projectPackage, null, 2)}\n`, "utf8");

  const charactersNotesPath = path.join(storyBibleDir, "characters.md");
  fs.writeFileSync(charactersNotesPath, "# Characters\n\n", "utf8");
  logLine(`Created project: ${path.relative(repoRoot, projectRoot)}`);
  logLine(`- ${path.relative(repoRoot, projectJsonPath)}`);
  logLine(`- ${path.relative(repoRoot, projectPackagePath)}`);
  logLine(`- ${path.relative(repoRoot, charactersNotesPath)}`);
}

function getProjectIds(): string[] {
  const projectsDir = path.join(repoRoot, config.projectsDir);
  if (!fs.existsSync(projectsDir)) {
    return [];
  }

  return fs
    .readdirSync(projectsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((id) => fs.existsSync(path.join(projectsDir, id, "project.json")))
    .sort();
}

function resolveProject(explicitProjectId?: string): ProjectContext {
  const ids = getProjectIds();
  const projectId =
    explicitProjectId ||
    process.env.WRITING_PROJECT ||
    inferProjectIdFromCwd(process.cwd()) ||
    (ids.length === 1 ? ids[0] : null);

  if (!projectId) {
    throw new Error("Project id is required. Use --project <project-id>.");
  }

  const projectRoot = path.join(repoRoot, config.projectsDir, projectId);
  if (!fs.existsSync(projectRoot)) {
    throw new Error(`Project not found: ${projectRoot}`);
  }

  return {
    id: projectId,
    root: projectRoot,
    manuscriptDir: path.join(projectRoot, config.chapterDir),
    storyBibleDir: path.join(projectRoot, config.storyBibleDir),
    notesDir: path.join(projectRoot, config.notesDir),
    distDir: path.join(projectRoot, config.distDir),
    meta: readJson<ProjectMeta>(path.join(projectRoot, "project.json"))
  };
}

function inferProjectIdFromCwd(cwd: string): string | null {
  const projectsRoot = path.resolve(repoRoot, config.projectsDir);
  const relative = path.relative(projectsRoot, path.resolve(cwd));
  if (!relative || relative === "." || relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }

  const projectId = relative.split(path.sep)[0];
  if (!projectId) {
    return null;
  }

  const projectJsonPath = path.join(projectsRoot, projectId, "project.json");
  if (!fs.existsSync(projectJsonPath)) {
    return null;
  }

  return projectId;
}

function inspectProject(
  project: ProjectContext,
  runtimeConfig: WritingConfig,
  options: InspectProjectOptions = {}
): ProjectInspection {
  const issues: Issue[] = [];
  const emptyBibleState: StoryBibleState = { ids: new Set<string>(), issues: [] };
  const bibleSchema = resolveBibleSchema(project);
  const requiredMetadataState = resolveRequiredMetadata(project, runtimeConfig);
  issues.push(...bibleSchema.issues);
  issues.push(...requiredMetadataState.issues);

  let chapterFiles: string[] = [];
  const onlyFile = options.onlyFile?.trim();
  if (onlyFile) {
    const resolvedPath = path.resolve(project.root, onlyFile);
    const relativeToProject = path.relative(project.root, resolvedPath);
    if (!relativeToProject || relativeToProject.startsWith("..") || path.isAbsolute(relativeToProject)) {
      issues.push(
        makeIssue("error", "structure", `Requested file is outside the project: ${onlyFile}`, null)
      );
      return { chapters: [], issues, bibleState: emptyBibleState };
    }

    if (!fs.existsSync(resolvedPath)) {
      issues.push(makeIssue("error", "structure", `Requested file does not exist: ${onlyFile}`, null));
      return { chapters: [], issues, bibleState: emptyBibleState };
    }

    if (!fs.statSync(resolvedPath).isFile() || !resolvedPath.endsWith(".md")) {
      issues.push(makeIssue("error", "structure", `Requested file must be a markdown file: ${onlyFile}`, null));
      return { chapters: [], issues, bibleState: emptyBibleState };
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
      return { chapters: [], issues, bibleState: emptyBibleState };
    }

    chapterFiles = [resolvedPath];
  } else {
    if (!fs.existsSync(project.manuscriptDir)) {
      issues.push(makeIssue("error", "structure", `Missing manuscript directory: ${project.manuscriptDir}`));
      return { chapters: [], issues, bibleState: emptyBibleState };
    }

    chapterFiles = fs
      .readdirSync(project.manuscriptDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => path.join(project.manuscriptDir, entry.name))
      .sort();

    if (chapterFiles.length === 0) {
      issues.push(makeIssue("error", "structure", `No manuscript files found in ${project.manuscriptDir}`));
      return { chapters: [], issues, bibleState: emptyBibleState };
    }
  }

  const chapters = chapterFiles.map((chapterPath) =>
    parseChapter(
      chapterPath,
      runtimeConfig,
      requiredMetadataState.requiredMetadata,
      bibleSchema.schema.categories,
      bibleSchema.schema.inlineIdRegex
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
  issues.push(...validateChapterProgression(chapters));

  const bibleState = readStoryBible(project.storyBibleDir, bibleSchema.schema.categories, bibleSchema.schema.inlineIdRegex);
  issues.push(...bibleState.issues);

  for (const chapter of chapters) {
    issues.push(...findUnknownBibleIds(chapter.referenceIds, bibleState.ids, chapter.relativePath));
  }

  return { chapters, issues, bibleState };
}

function parseChapter(
  chapterPath: string,
  runtimeConfig: WritingConfig,
  requiredMetadata: string[],
  bibleCategories: BibleCategory[],
  inlineIdRegex: RegExp | null
): ChapterEntry {
  const relativePath = path.relative(repoRoot, chapterPath);
  const raw = fs.readFileSync(chapterPath, "utf8");
  const { metadata, body, issues } = parseMetadata(raw, chapterPath, false);

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
    chapterIssues.push(
      makeIssue(
        "warning",
        "metadata",
        "Metadata 'order' is ignored. Ordering is derived from filename prefix.",
        relativePath
      )
    );
  }

  const order = parseOrderFromFilename(chapterPath, relativePath, chapterIssues);

  const status = String(metadata.status || "").trim();
  if (status && !isStageName(status)) {
    chapterIssues.push(
      makeIssue(
        "error",
        "metadata",
        `Invalid chapter status '${status}'. Allowed: ${runtimeConfig.allowedStatuses.join(", ")}.`,
        relativePath
      )
    );
  }

  let chapterNumber: number | null = null;
  if (typeof metadata.chapter === "number") {
    chapterNumber = metadata.chapter;
  } else if (typeof metadata.chapter === "string" && /^\d+$/.test(metadata.chapter)) {
    chapterNumber = Number(metadata.chapter);
  }

  if (chapterNumber != null && (!Number.isInteger(chapterNumber) || chapterNumber < 1)) {
    chapterIssues.push(
      makeIssue("error", "metadata", "Metadata 'chapter' must be a positive integer.", relativePath)
    );
  }

  const chapterTitle = normalizeChapterTitle(metadata.chapter_title, relativePath, chapterIssues);
  const referenceValidation = extractReferenceIds(metadata, relativePath, bibleCategories);
  chapterIssues.push(...referenceValidation.issues);
  chapterIssues.push(...findInlineBibleIdMentions(body, relativePath, inlineIdRegex));
  chapterIssues.push(...validateMarkdownBody(body, chapterPath));

  return {
    path: chapterPath,
    relativePath,
    title,
    order,
    chapterNumber,
    chapterTitle,
    status,
    referenceIds: referenceValidation.ids,
    metadata,
    body,
    issues: chapterIssues
  };
}

function normalizeChapterTitle(rawChapterTitle: MetadataValue | undefined, relativePath: string, issues: Issue[]): string {
  if (rawChapterTitle == null || rawChapterTitle === "") {
    return "";
  }

  if (typeof rawChapterTitle !== "string") {
    issues.push(makeIssue("error", "metadata", "Metadata 'chapter_title' must be a string.", relativePath));
    return "";
  }

  return rawChapterTitle.trim();
}

function deriveEntryTitle(rawTitle: MetadataValue | undefined, chapterPath: string): string {
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
    issues.push(
      makeIssue(
        "error",
        "ordering",
        "Filename must start with a numeric prefix followed by '-' or '_' (for example '100-scene.md').",
        relativePath
      )
    );
    return null;
  }

  if (match[1].length !== 3) {
    issues.push(
      makeIssue(
        "warning",
        "ordering",
        `Filename prefix '${match[1]}' is valid but non-standard. Use three digits like 100, 200, 300.`,
        relativePath
      )
    );
  }

  return Number(match[1]);
}

function extractReferenceIds(
  metadata: Metadata,
  relativePath: string,
  bibleCategories: BibleCategory[]
): { ids: string[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const ids = new Set<string>();

  for (const category of bibleCategories) {
    const rawValue = metadata[category.key];
    if (rawValue == null || rawValue === "") {
      continue;
    }

    if (!Array.isArray(rawValue)) {
      issues.push(
        makeIssue(
          "error",
          "metadata",
          `Metadata '${category.key}' must be an array, for example: [\"${category.prefix}-...\"]`,
          relativePath
        )
      );
      continue;
    }

    for (const entry of rawValue) {
      if (typeof entry !== "string") {
        issues.push(
          makeIssue("error", "metadata", `Metadata '${category.key}' entries must be strings.`, relativePath)
        );
        continue;
      }

      const id = entry.trim();
      if (!category.idPattern.test(id)) {
        issues.push(
          makeIssue(
            "error",
            "metadata",
            `Invalid ${category.key} reference '${id}'. Expected pattern '${category.idPattern.source}'.`,
            relativePath
          )
        );
        continue;
      }
      ids.add(id);
    }
  }

  return { ids: [...ids], issues };
}

function findInlineBibleIdMentions(body: string, relativePath: string, inlineIdRegex: RegExp | null): Issue[] {
  const issues: Issue[] = [];
  if (!inlineIdRegex) {
    return issues;
  }

  const lines = body.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const matches = lines[index].match(inlineIdRegex);
    if (!matches) {
      continue;
    }

    for (const id of matches) {
      issues.push(
        makeIssue(
          "error",
          "continuity",
          `Inline ID '${id}' found in prose. Move canon IDs to metadata fields only.`,
          relativePath,
          index + 1
        )
      );
    }
  }

  return issues;
}

function parseMetadata(raw: string, chapterPath: string, required: boolean): ParseMetadataResult {
  const relativePath = path.relative(repoRoot, chapterPath);
  const issues = [];

  if (!raw.startsWith("---\n") && !raw.startsWith("---\r\n")) {
    if (!required) {
      return { metadata: {}, body: raw, issues: [] };
    }
    return {
      metadata: {},
      body: raw,
      issues: [makeIssue("error", "metadata", "Missing metadata block at top of file.", relativePath)]
    };
  }

  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return {
      metadata: {},
      body: raw,
      issues: [makeIssue("error", "metadata", "Metadata opening delimiter found, but closing delimiter is missing.", relativePath)]
    };
  }

  const metadataText = match[1];
  const body = raw.slice(match[0].length);
  const metadata: Metadata = {};

  const lines = metadataText.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      issues.push(
        makeIssue(
          "error",
          "metadata",
          `Invalid metadata line '${line}'. Expected 'key: value' format.`,
          relativePath,
          i + 1
        )
      );
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (!value) {
      let lookahead = i + 1;
      while (lookahead < lines.length) {
        const nextTrimmed = lines[lookahead].trim();
        if (!nextTrimmed || nextTrimmed.startsWith("#")) {
          lookahead += 1;
          continue;
        }
        break;
      }

      if (lookahead < lines.length) {
        const firstValueLine = lines[lookahead];
        const firstValueTrimmed = firstValueLine.trim();
        const firstValueIndent = firstValueLine.length - firstValueLine.trimStart().length;

        if (firstValueIndent > 0 && firstValueTrimmed.startsWith("- ")) {
          const items: string[] = [];
          let j = lookahead;

          while (j < lines.length) {
            const candidateRaw = lines[j];
            const candidateTrimmed = candidateRaw.trim();
            if (!candidateTrimmed || candidateTrimmed.startsWith("#")) {
              j += 1;
              continue;
            }

            const indent = candidateRaw.length - candidateRaw.trimStart().length;
            if (indent === 0) {
              break;
            }

            if (!candidateTrimmed.startsWith("- ")) {
              issues.push(
                makeIssue(
                  "error",
                  "metadata",
                  `Unsupported metadata list line '${candidateTrimmed}'. Expected '- value'.`,
                  relativePath,
                  j + 1
                )
              );
              j += 1;
              continue;
            }

            const itemValue = candidateTrimmed.slice(2).trim().replace(/^['"]|['"]$/g, "");
            items.push(itemValue);
            j += 1;
          }

          metadata[key] = items;
          i = j - 1;
          continue;
        }
      }
    }

    metadata[key] = coerceMetadataValue(value);
  }

  return { metadata, body, issues };
}

function coerceMetadataValue(value: string): MetadataValue {
  if (!value) {
    return "";
  }

  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    if (!inner) {
      return [];
    }
    return inner.split(",").map((entry) => entry.trim().replace(/^['\"]|['\"]$/g, ""));
  }

  if (/^-?\d+$/.test(value)) {
    return Number(value);
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return value;
}

function validateMarkdownBody(body: string, chapterPath: string): Issue[] {
  const relativePath = path.relative(repoRoot, chapterPath);
  const issues: Issue[] = [];
  const lines = body.split(/\r?\n/);

  let openFence = null;
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
        issues.push(
          makeIssue(
            "warning",
            "style",
            `Heading level jumps from H${previousHeadingLevel} to H${level}.`,
            relativePath,
            i + 1
          )
        );
      }
      previousHeadingLevel = level;
    }

    if (/\[[^\]]+\]\([^\)]*$/.test(line.trim())) {
      issues.push(makeIssue("error", "structure", "Malformed markdown link, missing closing ')'.", relativePath, i + 1));
    }
  }

  if (openFence) {
    issues.push(
      makeIssue(
        "error",
        "structure",
        `Unclosed code fence opened at line ${openFence.line}.`,
        relativePath,
        openFence.line
      )
    );
  }

  issues.push(...checkLocalMarkdownLinks(body, chapterPath));
  issues.push(...runStyleHeuristics(body, relativePath));
  return issues;
}

function checkLocalMarkdownLinks(body: string, chapterPath: string): Issue[] {
  const relativePath = path.relative(repoRoot, chapterPath);
  const issues: Issue[] = [];
  const linkRegex = /!?\[[^\]]*\]\(([^)]+)\)/g;
  let match;

  while ((match = linkRegex.exec(body)) !== null) {
    let target = match[1].trim();

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

    const cleanTarget = target.split("#")[0];
    if (!cleanTarget) {
      continue;
    }

    const resolved = path.resolve(path.dirname(chapterPath), cleanTarget);
    if (!fs.existsSync(resolved)) {
      issues.push(
        makeIssue(
          "warning",
          "links",
          `Broken local link/image target '${cleanTarget}'.`,
          relativePath
        )
      );
    }
  }

  return issues;
}

function isExternalTarget(target: string): boolean {
  return (
    target.startsWith("http://") ||
    target.startsWith("https://") ||
    target.startsWith("mailto:") ||
    target.startsWith("tel:")
  );
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
        issues.push(
          makeIssue("warning", "style", `Long sentence detected (${sentenceWords} words).`, relativePath)
        );
      }
    }
  }

  return issues;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function validateChapterProgression(chapters: ChapterEntry[]): Issue[] {
  const issues: Issue[] = [];
  let previousChapter: number | null = null;
  const chapterTitles = new Map<number, string>();

  for (const chapter of chapters) {
    const chapterNumber = chapter.chapterNumber;
    if (chapterNumber == null || !Number.isInteger(chapterNumber) || chapterNumber < 1) {
      continue;
    }

    if (previousChapter != null && chapterNumber < previousChapter) {
      issues.push(
        makeIssue(
          "error",
          "ordering",
          `Chapter number moves backward from ${previousChapter} to ${chapterNumber}.`,
          chapter.relativePath
        )
      );
    }
    previousChapter = chapterNumber;

    const existingTitle = chapterTitles.get(chapterNumber);
    if (!existingTitle) {
      chapterTitles.set(chapterNumber, chapter.chapterTitle || chapter.title);
      continue;
    }

    if (chapter.chapterTitle && chapter.chapterTitle !== existingTitle) {
      issues.push(
        makeIssue(
          "warning",
          "metadata",
          `Chapter ${chapterNumber} has conflicting chapter_title values ('${existingTitle}' vs '${chapter.chapterTitle}').`,
          chapter.relativePath
        )
      );
    }
  }

  return issues;
}

function readStoryBible(
  storyBibleDir: string,
  bibleCategories: BibleCategory[],
  inlineIdRegex: RegExp | null
): StoryBibleState {
  const issues: Issue[] = [];
  const ids = new Set<string>();

  if (bibleCategories.length === 0) {
    return { ids, issues };
  }

  if (!fs.existsSync(storyBibleDir)) {
    issues.push(makeIssue("warning", "continuity", `Missing story-bible directory: ${storyBibleDir}`));
    return { ids, issues };
  }

  for (const category of bibleCategories) {
    const fullPath = path.join(storyBibleDir, category.notesFile);
    const relativePath = path.relative(repoRoot, fullPath);

    if (!fs.existsSync(fullPath)) {
      issues.push(
        makeIssue(
          "warning",
          "continuity",
          `Missing story bible file '${category.notesFile}' for category '${category.key}'.`,
          relativePath
        )
      );
      continue;
    }

    const text = fs.readFileSync(fullPath, "utf8");
    if (!inlineIdRegex) {
      continue;
    }
    const matches = text.match(inlineIdRegex) || [];
    for (const id of matches) {
      ids.add(id);
    }
  }

  return { ids, issues };
}

function findUnknownBibleIds(referenceIds: string[], knownIds: Set<string>, relativePath: string): Issue[] {
  const issues: Issue[] = [];

  for (const id of referenceIds) {
    if (!knownIds.has(id)) {
      issues.push(
        makeIssue("warning", "continuity", `Metadata reference '${id}' does not exist in the story bible files.`, relativePath)
      );
    }
  }

  return issues;
}

function runStageCheck(
  project: ProjectContext,
  runtimeConfig: WritingConfig,
  stage: string,
  onlyFile?: string
): { chapters: ChapterEntry[]; issues: Issue[] } {
  if (!isStageName(stage)) {
    throw new Error(`Unknown stage '${stage}'. Allowed: ${Object.keys(runtimeConfig.stagePolicies).join(", ")}.`);
  }
  const policy = runtimeConfig.stagePolicies[stage];

  const report = inspectProject(project, runtimeConfig, { onlyFile });
  const issues = [...report.issues];

  const minimumRank = STATUS_RANK[policy.minimumChapterStatus];
  for (const chapter of report.chapters) {
    if (!isStageName(chapter.status)) {
      continue;
    }

    const chapterRank = STATUS_RANK[chapter.status];

    if (chapterRank == null) {
      continue;
    }

    if (chapterRank < minimumRank) {
      issues.push(
        makeIssue(
          "error",
          "stage",
          `Chapter status '${chapter.status}' is below required stage '${policy.minimumChapterStatus}'.`,
          chapter.relativePath
        )
      );
    }

    if (stage === "final" && chapter.status !== "final") {
      issues.push(makeIssue("error", "stage", "Final stage requires all chapters to be status 'final'.", chapter.relativePath));
    }
  }

  if (policy.requireStoryBible) {
    for (const bibleIssue of report.issues.filter((issue) => issue.category === "continuity")) {
      if (bibleIssue.message.startsWith("Missing story bible file")) {
        issues.push({ ...bibleIssue, level: "error" });
      }
    }
  }

  if (policy.enforceLocalLinks) {
    for (const linkIssue of issues.filter((issue) => issue.category === "links" && issue.level !== "error")) {
      linkIssue.level = "error";
      linkIssue.message = `${linkIssue.message} (strict in stage '${stage}')`;
    }
  }

  const chapterPaths = report.chapters.map((chapter) => chapter.path);
  const storyBibleWords = collectStoryBibleWordsForSpellcheck(report.bibleState.ids);

  if (policy.enforceMarkdownlint) {
    issues.push(...runMarkdownlint(chapterPaths, true));
  } else {
    issues.push(...runMarkdownlint(chapterPaths, false));
  }

  if (policy.enforceCSpell) {
    issues.push(...runCSpell(chapterPaths, true, storyBibleWords));
  } else {
    issues.push(...runCSpell(chapterPaths, false, storyBibleWords));
  }

  return { chapters: report.chapters, issues };
}

function runMarkdownlint(files: string[], required: boolean): Issue[] {
  const markdownlintCommand = resolveCommand("markdownlint");
  if (!markdownlintCommand) {
    if (required) {
      return [
        makeIssue(
          "error",
          "tooling",
          "markdownlint is required for this stage but not installed. Run 'npm i' in the repo root."
        )
      ];
    }
    return [];
  }

  const result = spawnSync(
    markdownlintCommand,
    ["--config", path.join(repoRoot, ".markdownlint.json"), ...files],
    {
      cwd: repoRoot,
      encoding: "utf8"
    }
  );

  if (result.status === 0) {
    return [];
  }

  const details = compactToolOutput(result.stdout, result.stderr);
  return [makeIssue(required ? "error" : "warning", "lint", `markdownlint reported issues. ${details}`)];
}

function collectStoryBibleWordsForSpellcheck(ids: Set<string>): string[] {
  const words = new Set<string>();

  for (const id of ids) {
    const parts = id
      .split("-")
      .map((part) => part.trim())
      .filter(Boolean);

    for (const part of parts.slice(1)) {
      if (!/[A-Za-z]/.test(part)) {
        continue;
      }
      words.add(part.toLowerCase());
    }
  }

  return Array.from(words).sort();
}

function runCSpell(files: string[], required: boolean, extraWords: string[] = []): Issue[] {
  const cspellCommand = resolveCommand("cspell");
  if (!cspellCommand) {
    if (required) {
      return [
        makeIssue(
          "error",
          "tooling",
          "cspell is required for this stage but not installed. Run 'npm i' in the repo root."
        )
      ];
    }
    return [];
  }

  let tempConfigDir: string | null = null;
  let cspellConfigPath = path.join(repoRoot, ".cspell.json");

  if (extraWords.length > 0) {
    const baseConfig = readJson<Record<string, unknown>>(cspellConfigPath);
    const existingWords = Array.isArray(baseConfig.words) ? baseConfig.words.filter((word) => typeof word === "string") : [];
    const mergedWords = new Set<string>([...existingWords, ...extraWords]);

    tempConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), "stego-cspell-"));
    cspellConfigPath = path.join(tempConfigDir, "cspell.generated.json");
    fs.writeFileSync(
      cspellConfigPath,
      `${JSON.stringify({ ...baseConfig, words: Array.from(mergedWords).sort() }, null, 2)}\n`,
      "utf8"
    );
  }

  const result = spawnSync(
    cspellCommand,
    ["--no-progress", "--no-summary", "--config", cspellConfigPath, ...files],
    {
      cwd: repoRoot,
      encoding: "utf8"
    }
  );

  if (tempConfigDir) {
    fs.rmSync(tempConfigDir, { recursive: true, force: true });
  }

  if (result.status === 0) {
    return [];
  }

  const details = compactToolOutput(result.stdout, result.stderr);
  return [
    makeIssue(
      required ? "error" : "warning",
      "spell",
      `cspell reported issues. ${details} Words from story-bible identifiers are auto-whitelisted. For additional terms, add them to '.cspell.json' under the 'words' array.`
    )
  ];
}

function resolveCommand(command: string): string | null {
  const localCommandPath = path.join(
    repoRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? `${command}.cmd` : command
  );
  if (fs.existsSync(localCommandPath)) {
    return localCommandPath;
  }

  return null;
}

function compactToolOutput(stdout: string | null, stderr: string | null): string {
  const text = `${stdout || ""}\n${stderr || ""}`.trim();
  if (!text) {
    return "No details provided by tool.";
  }

  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(0, 4)
    .join(" | ");
}

function buildManuscript(project: ProjectContext, chapters: ChapterEntry[]): string {
  fs.mkdirSync(project.distDir, { recursive: true });

  const generatedAt = new Date().toISOString();
  const title = project.meta.title || project.id;
  const subtitle = project.meta.subtitle || "";
  const author = project.meta.author || "";
  const chapterSections = buildChapterSections(chapters);

  const lines: string[] = [];
  lines.push(`<!-- generated: ${generatedAt} -->`);
  lines.push("");
  lines.push(`# ${title}`);
  lines.push("");

  if (subtitle) {
    lines.push(`_${subtitle}_`);
    lines.push("");
  }

  if (author) {
    lines.push(`Author: ${author}`);
    lines.push("");
  }

  lines.push(`Generated: ${generatedAt}`);
  lines.push("");
  lines.push("## Table of Contents");
  lines.push("");

  for (let index = 0; index < chapterSections.length; index += 1) {
    const sectionHeading = getSectionHeading(chapterSections[index], index, chapterSections.length);
    lines.push(`- [${sectionHeading}](#${slugify(sectionHeading)})`);
  }

  lines.push("");

  for (let index = 0; index < chapterSections.length; index += 1) {
    const chapterSection = chapterSections[index];
    const chapterHeading = getSectionHeading(chapterSection, index, chapterSections.length);
    lines.push("---");
    lines.push("");
    lines.push(`## ${chapterHeading}`);
    lines.push("");

    for (const entry of chapterSection.entries) {
      lines.push(`### ${entry.title}`);
      lines.push("");
      lines.push(`<!-- source: ${entry.relativePath} | order: ${entry.order} | status: ${entry.status} -->`);
      lines.push("");
      lines.push(entry.body.trim());
      lines.push("");
    }

    lines.push("");
  }

  const outputPath = path.join(project.distDir, `${project.id}.md`);
  fs.writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");
  return outputPath;
}

function buildChapterSections(chapters: ChapterEntry[]): ChapterSection[] {
  const sections: ChapterSection[] = [];
  const hasChapterNumbers = chapters.some((chapter) => chapter.chapterNumber != null);

  if (!hasChapterNumbers) {
    return [
      {
        chapterNumber: null,
        chapterTitle: "Manuscript",
        entries: chapters
      }
    ];
  }

  let currentSection: ChapterSection | null = null;

  for (const chapter of chapters) {
    if (chapter.chapterNumber == null) {
      if (!currentSection || currentSection.chapterNumber != null) {
        currentSection = {
          chapterNumber: null,
          chapterTitle: "Ungrouped",
          entries: []
        };
        sections.push(currentSection);
      }
      currentSection.entries.push(chapter);
      continue;
    }

    if (!currentSection || currentSection.chapterNumber !== chapter.chapterNumber) {
      currentSection = {
        chapterNumber: chapter.chapterNumber,
        chapterTitle: chapter.chapterTitle || chapter.title,
        entries: []
      };
      sections.push(currentSection);
    } else if (chapter.chapterTitle && !currentSection.chapterTitle) {
      currentSection.chapterTitle = chapter.chapterTitle;
    }

    if (!currentSection) {
      continue;
    }
    currentSection.entries.push(chapter);
  }

  return sections;
}

function getSectionHeading(section: ChapterSection, index: number, total: number): string {
  if (section.chapterNumber != null) {
    return `Chapter ${section.chapterNumber}: ${section.chapterTitle}`;
  }

  if (total === 1) {
    return section.chapterTitle || "Manuscript";
  }

  return section.chapterTitle || `Section ${index + 1}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function runExport(project: ProjectContext, format: string, inputPath: string, explicitOutputPath?: string): string {
  if (!isExportFormat(format)) {
    throw new Error(`Unsupported export format '${format}'. Use md, docx, pdf, or epub.`);
  }

  const exporters: Record<ExportFormat, Exporter> = {
    md: markdownExporter,
    docx: createPandocExporter("docx"),
    pdf: createPandocExporter("pdf"),
    epub: createPandocExporter("epub")
  };

  const exporter = exporters[format];

  const targetPath =
    explicitOutputPath || path.join(project.distDir, "exports", `${project.id}.${format === "md" ? "md" : format}`);

  const capability = exporter.canRun();
  if (!capability.ok) {
    throw new Error(capability.reason || `Exporter '${exporter.id}' cannot run.`);
  }

  exporter.run({
    inputPath,
    outputPath: path.resolve(repoRoot, targetPath)
  });

  return path.resolve(repoRoot, targetPath);
}

function printReport(issues: Issue[]): void {
  if (issues.length === 0) {
    return;
  }

  for (const issue of issues) {
    const filePart = issue.file ? ` ${issue.file}` : "";
    const linePart = issue.line ? `:${issue.line}` : "";
    console.log(`[${issue.level.toUpperCase()}][${issue.category}]${filePart}${linePart} ${issue.message}`);
  }
}

function exitIfErrors(issues: Issue[]): void {
  if (issues.some((issue) => issue.level === "error")) {
    process.exit(1);
  }
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

function readJson<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing JSON file: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8");
  try {
    return JSON.parse(raw) as T;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`Invalid JSON at ${filePath}: ${error.message}`);
    }
    throw new Error(`Invalid JSON at ${filePath}: ${String(error)}`);
  }
}

function toDisplayTitle(value: string): string {
  return value
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toBoundedInt(value: unknown, fallback: number, min: number, max: number): number {
  let parsed: number | null = null;
  if (typeof value === "number" && Number.isFinite(value)) {
    parsed = value;
  } else if (typeof value === "string" && value.trim() !== "") {
    const next = Number(value.trim());
    if (Number.isFinite(next)) {
      parsed = next;
    }
  }

  if (parsed == null) {
    return fallback;
  }

  const rounded = Math.round(parsed);
  return Math.min(max, Math.max(min, rounded));
}

function logLine(message: string): void {
  console.log(message);
}

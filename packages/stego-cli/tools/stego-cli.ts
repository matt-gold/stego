#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
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
  requireSpine: boolean;
  enforceMarkdownlint: boolean;
  enforceCSpell: boolean;
  enforceLocalLinks: boolean;
  requireResolvedComments?: boolean;
}

interface WritingConfig {
  projectsDir: string;
  chapterDir: string;
  spineDir: string;
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
  spineCategories?: unknown;
  compileStructure?: unknown;
  [key: string]: unknown;
}

type PageBreakMode = "none" | "between-groups";

interface CompileStructureLevel {
  key: string;
  label: string;
  titleKey?: string;
  injectHeading: boolean;
  headingTemplate: string;
  pageBreak: PageBreakMode;
}

interface SpineCategory {
  key: string;
  prefix: string;
  notesFile: string;
  idPattern: RegExp;
}

interface ProjectContext {
  id: string;
  root: string;
  manuscriptDir: string;
  spineDir: string;
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
  status: string;
  referenceIds: string[];
  groupValues: Record<string, string>;
  metadata: Metadata;
  body: string;
  comments: ParsedCommentThread[];
  issues: Issue[];
}

interface SpineState {
  ids: Set<string>;
  issues: Issue[];
}

interface ProjectInspection {
  chapters: ChapterEntry[];
  issues: Issue[];
  spineState: SpineState;
  compileStructureLevels: CompileStructureLevel[];
}

interface InspectProjectOptions {
  onlyFile?: string;
}

interface ParseMetadataResult {
  metadata: Metadata;
  body: string;
  comments: ParsedCommentThread[];
  issues: Issue[];
}

interface ParsedCommentThread {
  id: string;
  resolved: boolean;
  thread: string[];
}

interface SpineSchema {
  categories: SpineCategory[];
  inlineIdRegex: RegExp | null;
}

interface WorkspaceContext {
  repoRoot: string;
  configPath: string;
  config: WritingConfig;
}

const STATUS_RANK: Record<StageName, number> = {
  draft: 0,
  revise: 1,
  "line-edit": 2,
  proof: 3,
  final: 4
};
const RESERVED_COMMENT_PREFIX = "CMT";
const ROOT_CONFIG_FILENAME = "stego.config.json";
const PROSE_FONT_PROMPT = "Switch workspace to proportional (prose-style) font? (recommended)";
const SCAFFOLD_GITIGNORE_CONTENT = `node_modules/
/dist/
.DS_Store
*.log
projects/*/dist/*
!projects/*/dist/.gitkeep
projects/*/.vscode/settings.json
.vscode/settings.json
`;
const SCAFFOLD_README_CONTENT = `# Stego Workspace

This directory is a Stego writing workspace (a monorepo for one or more writing projects).

## What was scaffolded

- \`stego.config.json\` workspace configuration
- \`projects/\` demo projects (\`docs-demo\` and \`plague-demo\`)
- \`docs/\` workflow and conventions docs
- root \`package.json\` scripts for Stego commands
- root \`.vscode/tasks.json\` tasks for common workflows

## First run

\`\`\`bash
npm install
npm run list-projects
\`\`\`

## Run commands for a specific project (from workspace root)

\`\`\`bash
npm run validate -- --project plague-demo
npm run build -- --project plague-demo
npm run check-stage -- --project plague-demo --stage revise
npm run export -- --project plague-demo --format md
\`\`\`

## Work inside one project

Each project also has local scripts, so you can run commands from inside a project directory:

\`\`\`bash
cd projects/plague-demo
npm run validate
npm run build
\`\`\`

## VS Code recommendation

When you are actively working on one project, open that project directory directly in VS Code (for example \`projects/plague-demo\`).

This keeps your editor context focused and applies the project's recommended extensions (including Stego + Saurus) for that project.

## Create a new project

\`\`\`bash
stego new-project --project my-book --title "My Book"
\`\`\`
`;
const PROSE_MARKDOWN_EDITOR_SETTINGS: Record<string, unknown> = {
  "[markdown]": {
    "editor.fontFamily": "Inter, Helvetica Neue, Helvetica, Arial, sans-serif",
    "editor.fontSize": 17,
    "editor.lineHeight": 28,
    "editor.wordWrap": "wordWrapColumn",
    "editor.wordWrapColumn": 72,
    "editor.lineNumbers": "off"
  },
  "markdown.preview.fontFamily": "Inter, Helvetica Neue, Helvetica, Arial, sans-serif"
};
const PROJECT_EXTENSION_RECOMMENDATIONS = [
  "matt-gold.stego-extension",
  "matt-gold.saurus-extension"
] as const;
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..");
let repoRoot = "";
let config!: WritingConfig;

void main();

async function main(): Promise<void> {
  const { command, options } = parseArgs(process.argv.slice(2));

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printUsage();
    return;
  }

  try {
    switch (command) {
      case "init":
        await initWorkspace({ force: readBooleanOption(options, "force") });
        return;
      case "list-projects":
        activateWorkspace(options);
        listProjects();
        return;
      case "new-project":
        activateWorkspace(options);
        await createProject(readStringOption(options, "project"), readStringOption(options, "title"));
        return;
      case "validate": {
        activateWorkspace(options);
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
        activateWorkspace(options);
        const project = resolveProject(readStringOption(options, "project"));
        const report = inspectProject(project, config);
        printReport(report.issues);
        exitIfErrors(report.issues);
        const outputPath = buildManuscript(project, report.chapters, report.compileStructureLevels);
        logLine(`Build output: ${outputPath}`);
        return;
      }
      case "check-stage": {
        activateWorkspace(options);
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
        activateWorkspace(options);
        const project = resolveProject(readStringOption(options, "project"));
        const format = (readStringOption(options, "format") || "md").toLowerCase();
        const report = inspectProject(project, config);
        printReport(report.issues);
        exitIfErrors(report.issues);
        const inputPath = buildManuscript(project, report.chapters, report.compileStructureLevels);
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

function readBooleanOption(options: ParsedOptions, key: string): boolean {
  return options[key] === true;
}

function activateWorkspace(options: ParsedOptions): WorkspaceContext {
  const workspace = resolveWorkspaceContext(readStringOption(options, "root"));
  repoRoot = workspace.repoRoot;
  config = workspace.config;
  return workspace;
}

function isStageName(value: string): value is StageName {
  return Object.hasOwn(STATUS_RANK, value);
}

function isExportFormat(value: string): value is ExportFormat {
  return value === "md" || value === "docx" || value === "pdf" || value === "epub";
}

function resolveSpineSchema(project: ProjectContext): { schema: SpineSchema; issues: Issue[] } {
  const issues: Issue[] = [];
  const projectFile = path.relative(repoRoot, path.join(project.root, "stego-project.json"));
  const rawCategories = project.meta.spineCategories;

  if (rawCategories == null) {
    return { schema: { categories: [], inlineIdRegex: null }, issues };
  }

  if (!Array.isArray(rawCategories)) {
    issues.push(
      makeIssue(
        "error",
        "metadata",
        "Project 'spineCategories' must be an array when defined.",
        projectFile
      )
    );
    return { schema: { categories: [], inlineIdRegex: null }, issues };
  }

  const categories: SpineCategory[] = [];
  const keySet = new Set<string>();
  const prefixSet = new Set<string>();
  const notesSet = new Set<string>();

  for (const [index, categoryEntry] of rawCategories.entries()) {
    if (!isPlainObject(categoryEntry)) {
      issues.push(
        makeIssue(
          "error",
          "metadata",
          `Invalid spineCategories entry at index ${index}. Expected object with key, prefix, notesFile.`,
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
          `Invalid spine category key '${key || "<empty>"}'. Use lowercase key names like 'cast' or 'incidents'.`,
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
          `Invalid spine category prefix '${prefix || "<empty>"}'. Use uppercase prefixes like 'CHAR' or 'STATUTE'.`,
          projectFile
        )
      );
      continue;
    }

    if (prefix.toUpperCase() === RESERVED_COMMENT_PREFIX) {
      issues.push(
        makeIssue(
          "error",
          "metadata",
          `Invalid spine category prefix '${prefix}'. '${RESERVED_COMMENT_PREFIX}' is reserved for Stego comment IDs (e.g. CMT-0001).`,
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
          `Invalid notesFile '${notesFile || "<empty>"}'. Use markdown filenames like 'characters.md' (resolved in spine/).`,
          projectFile
        )
      );
      continue;
    }

    if (keySet.has(key)) {
      issues.push(makeIssue("error", "metadata", `Duplicate spine category key '${key}'.`, projectFile));
      continue;
    }
    if (prefixSet.has(prefix)) {
      issues.push(makeIssue("error", "metadata", `Duplicate spine category prefix '${prefix}'.`, projectFile));
      continue;
    }
    if (notesSet.has(notesFile)) {
      issues.push(makeIssue("error", "metadata", `Duplicate spine category notesFile '${notesFile}'.`, projectFile));
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

function resolveCompileStructure(project: ProjectContext): { levels: CompileStructureLevel[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const projectFile = path.relative(repoRoot, path.join(project.root, "stego-project.json"));
  const raw = project.meta.compileStructure;

  if (raw == null) {
    return { levels: [], issues };
  }

  if (!isPlainObject(raw)) {
    issues.push(
      makeIssue(
        "error",
        "metadata",
        "Project 'compileStructure' must be an object.",
        projectFile
      )
    );
    return { levels: [], issues };
  }

  const rawLevels = raw.levels;
  if (!Array.isArray(rawLevels)) {
    issues.push(
      makeIssue(
        "error",
        "metadata",
        "Project 'compileStructure.levels' must be an array.",
        projectFile
      )
    );
    return { levels: [], issues };
  }

  const levels: CompileStructureLevel[] = [];
  const seenKeys = new Set<string>();

  for (const [index, entry] of rawLevels.entries()) {
    if (!isPlainObject(entry)) {
      issues.push(
        makeIssue(
          "error",
          "metadata",
          `Invalid compileStructure level at index ${index}. Expected object.`,
          projectFile
        )
      );
      continue;
    }

    const key = typeof entry.key === "string" ? entry.key.trim() : "";
    const label = typeof entry.label === "string" ? entry.label.trim() : "";
    const titleKeyRaw = typeof entry.titleKey === "string" ? entry.titleKey.trim() : "";
    const headingTemplateRaw = typeof entry.headingTemplate === "string" ? entry.headingTemplate.trim() : "";

    if (!key || !/^[a-z][a-z0-9_-]*$/.test(key)) {
      issues.push(
        makeIssue(
          "error",
          "metadata",
          `compileStructure.levels[${index}].key must match /^[a-z][a-z0-9_-]*$/.`,
          projectFile
        )
      );
      continue;
    }

    if (!label) {
      issues.push(
        makeIssue(
          "error",
          "metadata",
          `compileStructure.levels[${index}].label is required.`,
          projectFile
        )
      );
      continue;
    }

    if (seenKeys.has(key)) {
      issues.push(
        makeIssue(
          "error",
          "metadata",
          `Duplicate compileStructure level key '${key}'.`,
          projectFile
        )
      );
      continue;
    }

    if (titleKeyRaw && !/^[a-z][a-z0-9_-]*$/.test(titleKeyRaw)) {
      issues.push(
        makeIssue(
          "error",
          "metadata",
          `compileStructure.levels[${index}].titleKey must match /^[a-z][a-z0-9_-]*$/.`,
          projectFile
        )
      );
      continue;
    }

    const pageBreakRaw = typeof entry.pageBreak === "string" ? entry.pageBreak.trim() : "none";
    if (pageBreakRaw !== "none" && pageBreakRaw !== "between-groups") {
      issues.push(
        makeIssue(
          "error",
          "metadata",
          `compileStructure.levels[${index}].pageBreak must be 'none' or 'between-groups'.`,
          projectFile
        )
      );
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

function buildInlineIdRegex(categories: SpineCategory[]): RegExp | null {
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

function resolveWorkspaceContext(rootOption?: string): WorkspaceContext {
  if (rootOption) {
    const explicitRoot = path.resolve(process.cwd(), rootOption);
    if (!fs.existsSync(explicitRoot) || !fs.statSync(explicitRoot).isDirectory()) {
      throw new Error(`Workspace root does not exist or is not a directory: ${explicitRoot}`);
    }

    const explicitConfigPath = path.join(explicitRoot, ROOT_CONFIG_FILENAME);
    if (!fs.existsSync(explicitConfigPath)) {
      const legacyConfigPath = path.join(explicitRoot, "writing.config.json");
      if (fs.existsSync(legacyConfigPath)) {
        throw new Error(
          `Found legacy 'writing.config.json' at '${explicitRoot}'. Rename it to '${ROOT_CONFIG_FILENAME}'.`
        );
      }
      throw new Error(
        `No Stego workspace found at '${explicitRoot}'. Expected '${ROOT_CONFIG_FILENAME}'.`
      );
    }

    return {
      repoRoot: explicitRoot,
      configPath: explicitConfigPath,
      config: readJson<WritingConfig>(explicitConfigPath)
    };
  }

  const discoveredConfigPath = findNearestFileUpward(process.cwd(), ROOT_CONFIG_FILENAME);
  if (!discoveredConfigPath) {
    const legacyConfigPath = findNearestFileUpward(process.cwd(), "writing.config.json");
    if (legacyConfigPath) {
      throw new Error(
        `Found legacy '${path.basename(legacyConfigPath)}' at '${path.dirname(legacyConfigPath)}'. Rename it to '${ROOT_CONFIG_FILENAME}'.`
      );
    }
    throw new Error(
      `No Stego workspace found from '${process.cwd()}'. Run 'stego init' or pass --root <path>.`
    );
  }

  const discoveredRoot = path.dirname(discoveredConfigPath);
  return {
    repoRoot: discoveredRoot,
    configPath: discoveredConfigPath,
    config: readJson<WritingConfig>(discoveredConfigPath)
  };
}

function findNearestFileUpward(startPath: string, filename: string): string | null {
  let current = path.resolve(startPath);
  if (!fs.existsSync(current)) {
    return null;
  }

  if (!fs.statSync(current).isDirectory()) {
    current = path.dirname(current);
  }

  while (true) {
    const candidate = path.join(current, filename);
    if (fs.existsSync(candidate)) {
      return candidate;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

async function initWorkspace(options: { force: boolean }): Promise<void> {
  const targetRoot = process.cwd();
  const entries = fs
    .readdirSync(targetRoot, { withFileTypes: true })
    .filter((entry) => entry.name !== "." && entry.name !== "..");

  if (entries.length > 0 && !options.force) {
    throw new Error(`Target directory is not empty: ${targetRoot}. Re-run with --force to continue.`);
  }

  const copiedPaths: string[] = [];

  writeScaffoldGitignore(targetRoot, copiedPaths);
  writeScaffoldReadme(targetRoot, copiedPaths);
  copyTemplateAsset(".markdownlint.json", targetRoot, copiedPaths);
  copyTemplateAsset(".cspell.json", targetRoot, copiedPaths);
  copyTemplateAsset(ROOT_CONFIG_FILENAME, targetRoot, copiedPaths);
  copyTemplateAsset("docs", targetRoot, copiedPaths);
  copyTemplateAsset("projects", targetRoot, copiedPaths);
  copyTemplateAsset(path.join(".vscode", "tasks.json"), targetRoot, copiedPaths);
  copyTemplateAsset(path.join(".vscode", "extensions.json"), targetRoot, copiedPaths, { optional: true });

  rewriteTemplateProjectPackageScripts(targetRoot);
  const enableProseFont = await promptYesNo(PROSE_FONT_PROMPT, true);
  if (enableProseFont) {
    writeProjectProseEditorSettings(targetRoot, copiedPaths);
  }
  writeInitRootPackageJson(targetRoot);

  logLine(`Initialized Stego workspace in ${targetRoot}`);
  for (const relativePath of copiedPaths) {
    logLine(`- ${relativePath}`);
  }
  logLine("- package.json");
  logLine("");
  logLine("Next steps:");
  logLine("  npm install");
  logLine("  npm run list-projects");
  logLine("  npm run validate -- --project plague-demo");
}

async function promptYesNo(question: string, defaultYes: boolean): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return defaultYes;
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });
  const suffix = defaultYes ? " [Y/n] " : " [y/N] ";

  try {
    while (true) {
      const answer = (await rl.question(`${question}${suffix}`)).trim().toLowerCase();
      if (!answer) {
        return defaultYes;
      }
      if (answer === "y" || answer === "yes") {
        return true;
      }
      if (answer === "n" || answer === "no") {
        return false;
      }
      console.log("Please answer y or n.");
    }
  } finally {
    rl.close();
  }
}

function copyTemplateAsset(
  sourceRelativePath: string,
  targetRoot: string,
  copiedPaths: string[],
  options?: { optional?: boolean }
): void {
  const sourcePath = path.join(packageRoot, sourceRelativePath);
  if (!fs.existsSync(sourcePath)) {
    if (options?.optional) {
      return;
    }
    throw new Error(`Template asset is missing from stego-cli package: ${sourceRelativePath}`);
  }

  const destinationPath = path.join(targetRoot, sourceRelativePath);
  const stats = fs.statSync(sourcePath);

  if (stats.isDirectory()) {
    fs.mkdirSync(destinationPath, { recursive: true });
    fs.cpSync(sourcePath, destinationPath, {
      recursive: true,
      force: true,
      filter: (currentSourcePath) => shouldCopyTemplatePath(currentSourcePath)
    });
  } else {
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.copyFileSync(sourcePath, destinationPath);
  }

  copiedPaths.push(sourceRelativePath);
}

function writeScaffoldGitignore(targetRoot: string, copiedPaths: string[]): void {
  const destinationPath = path.join(targetRoot, ".gitignore");
  fs.writeFileSync(destinationPath, SCAFFOLD_GITIGNORE_CONTENT, "utf8");
  copiedPaths.push(".gitignore");
}

function writeScaffoldReadme(targetRoot: string, copiedPaths: string[]): void {
  const destinationPath = path.join(targetRoot, "README.md");
  fs.writeFileSync(destinationPath, SCAFFOLD_README_CONTENT, "utf8");
  copiedPaths.push("README.md");
}

function shouldCopyTemplatePath(currentSourcePath: string): boolean {
  const relativePath = path.relative(packageRoot, currentSourcePath);
  if (!relativePath || relativePath.startsWith("..")) {
    return true;
  }

  const parts = relativePath.split(path.sep);
  const name = parts[parts.length - 1] || "";

  if (name === ".DS_Store") {
    return false;
  }

  if (parts[0] === "projects") {
    if (parts[parts.length - 2] === ".vscode" && name === "settings.json") {
      return false;
    }

    const distIndex = parts.indexOf("dist");
    if (distIndex >= 0) {
      const isDistRoot = distIndex === parts.length - 1;
      const isGitkeep = name === ".gitkeep";
      return isDistRoot || isGitkeep;
    }
  }

  return true;
}

function rewriteTemplateProjectPackageScripts(targetRoot: string): void {
  const projectsRoot = path.join(targetRoot, "projects");
  if (!fs.existsSync(projectsRoot)) {
    return;
  }

  for (const entry of fs.readdirSync(projectsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const projectRoot = path.join(projectsRoot, entry.name);
    const packageJsonPath = path.join(projectsRoot, entry.name, "package.json");
    if (!fs.existsSync(packageJsonPath)) {
      continue;
    }

    const projectPackage = readJson<Record<string, unknown>>(packageJsonPath);
    const scripts = isPlainObject(projectPackage.scripts)
      ? { ...projectPackage.scripts }
      : {};

    if (typeof projectPackage.name === "string" && projectPackage.name.startsWith("writing-project-")) {
      projectPackage.name = projectPackage.name.replace(/^writing-project-/, "stego-project-");
    }

    scripts.validate = "npx --no-install stego validate";
    scripts.build = "npx --no-install stego build";
    scripts["check-stage"] = "npx --no-install stego check-stage";
    scripts.export = "npx --no-install stego export";

    projectPackage.scripts = scripts;
    fs.writeFileSync(packageJsonPath, `${JSON.stringify(projectPackage, null, 2)}\n`, "utf8");
    ensureProjectExtensionsRecommendations(projectRoot);
  }
}

function ensureProjectExtensionsRecommendations(projectRoot: string): void {
  const vscodeDir = path.join(projectRoot, ".vscode");
  const extensionsPath = path.join(vscodeDir, "extensions.json");
  fs.mkdirSync(vscodeDir, { recursive: true });

  let existingRecommendations: string[] = [];
  if (fs.existsSync(extensionsPath)) {
    try {
      const parsed = readJson<Record<string, unknown>>(extensionsPath);
      if (Array.isArray(parsed.recommendations)) {
        existingRecommendations = parsed.recommendations.filter((value): value is string => typeof value === "string");
      }
    } catch {
      existingRecommendations = [];
    }
  }

  const mergedRecommendations = [
    ...new Set<string>([...PROJECT_EXTENSION_RECOMMENDATIONS, ...existingRecommendations])
  ];
  const extensionsConfig = {
    recommendations: mergedRecommendations
  };

  fs.writeFileSync(extensionsPath, `${JSON.stringify(extensionsConfig, null, 2)}\n`, "utf8");
}

function writeProjectProseEditorSettings(targetRoot: string, copiedPaths: string[]): void {
  const projectsRoot = path.join(targetRoot, "projects");
  if (!fs.existsSync(projectsRoot)) {
    return;
  }

  for (const entry of fs.readdirSync(projectsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const projectRoot = path.join(projectsRoot, entry.name);
    const settingsPath = writeProseEditorSettingsForProject(projectRoot);
    copiedPaths.push(path.relative(targetRoot, settingsPath));
  }
}

function writeProseEditorSettingsForProject(projectRoot: string): string {
  const vscodeDir = path.join(projectRoot, ".vscode");
  const settingsPath = path.join(vscodeDir, "settings.json");
  fs.mkdirSync(vscodeDir, { recursive: true });

  let existingSettings: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    try {
      const parsed = readJson<Record<string, unknown>>(settingsPath);
      if (isPlainObject(parsed)) {
        existingSettings = parsed;
      }
    } catch {
      existingSettings = {};
    }
  }

  const proseMarkdownSettings = isPlainObject(PROSE_MARKDOWN_EDITOR_SETTINGS["[markdown]"])
    ? (PROSE_MARKDOWN_EDITOR_SETTINGS["[markdown]"] as Record<string, unknown>)
    : {};
  const existingMarkdownSettings = isPlainObject(existingSettings["[markdown]"])
    ? (existingSettings["[markdown]"] as Record<string, unknown>)
    : {};

  const nextSettings: Record<string, unknown> = {
    ...existingSettings,
    "[markdown]": {
      ...existingMarkdownSettings,
      ...proseMarkdownSettings
    },
    "markdown.preview.fontFamily": PROSE_MARKDOWN_EDITOR_SETTINGS["markdown.preview.fontFamily"]
  };

  fs.writeFileSync(settingsPath, `${JSON.stringify(nextSettings, null, 2)}\n`, "utf8");
  return settingsPath;
}

function writeInitRootPackageJson(targetRoot: string): void {
  const cliPackage = readJson<Record<string, unknown>>(path.join(packageRoot, "package.json"));
  const cliVersion = typeof cliPackage.version === "string" ? cliPackage.version : "0.1.0";

  const manifest: Record<string, unknown> = {
    name: path.basename(targetRoot) || "stego-workspace",
    private: true,
    type: "module",
    description: "Stego writing workspace",
    engines: {
      node: ">=20"
    },
    scripts: {
      "list-projects": "stego list-projects",
      "new-project": "stego new-project",
      validate: "stego validate",
      build: "stego build",
      "check-stage": "stego check-stage",
      export: "stego export"
    },
    devDependencies: {
      "stego-cli": `^${cliVersion}`,
      cspell: "^9.6.4",
      "markdownlint-cli": "^0.47.0"
    }
  };

  fs.writeFileSync(path.join(targetRoot, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function printUsage() {
  console.log(
    `Stego CLI\n\nCommands:\n  init [--force]\n  list-projects [--root <path>]\n  new-project --project <project-id> [--title <title>] [--root <path>]\n  validate --project <project-id> [--file <project-relative-manuscript-path>] [--root <path>]\n  build --project <project-id> [--root <path>]\n  check-stage --project <project-id> --stage <draft|revise|line-edit|proof|final> [--file <project-relative-manuscript-path>] [--root <path>]\n  export --project <project-id> --format <md|docx|pdf|epub> [--output <path>] [--root <path>]\n`
  );
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

async function createProject(projectIdOption?: string, titleOption?: string): Promise<void> {
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
  const spineDir = path.join(projectRoot, config.spineDir);
  fs.mkdirSync(spineDir, { recursive: true });
  const notesDir = path.join(projectRoot, config.notesDir);
  fs.mkdirSync(notesDir, { recursive: true });
  fs.mkdirSync(path.join(projectRoot, config.distDir), { recursive: true });

  const projectJson: Record<string, unknown> = {
    id: projectId,
    title: titleOption?.trim() || toDisplayTitle(projectId),
    requiredMetadata: ["status"],
    compileStructure: {
      levels: [
        {
          key: "chapter",
          label: "Chapter",
          titleKey: "chapter_title",
          injectHeading: true,
          headingTemplate: "{label} {value}: {title}",
          pageBreak: "none"
        }
      ]
    },
    spineCategories: [
      {
        key: "characters",
        prefix: "CHAR",
        notesFile: "characters.md"
      }
    ]
  };

  const projectJsonPath = path.join(projectRoot, "stego-project.json");
  fs.writeFileSync(projectJsonPath, `${JSON.stringify(projectJson, null, 2)}\n`, "utf8");

  const projectPackage: Record<string, unknown> = {
    name: `stego-project-${projectId}`,
    private: true,
    scripts: {
      validate: "npx --no-install stego validate",
      build: "npx --no-install stego build",
      "check-stage": "npx --no-install stego check-stage",
      export: "npx --no-install stego export"
    }
  };
  const projectPackagePath = path.join(projectRoot, "package.json");
  fs.writeFileSync(projectPackagePath, `${JSON.stringify(projectPackage, null, 2)}\n`, "utf8");

  const charactersNotesPath = path.join(spineDir, "characters.md");
  fs.writeFileSync(charactersNotesPath, "# Characters\n\n", "utf8");
  const projectExtensionsPath = path.join(projectRoot, ".vscode", "extensions.json");
  ensureProjectExtensionsRecommendations(projectRoot);
  let projectSettingsPath: string | null = null;
  const enableProseFont = await promptYesNo(PROSE_FONT_PROMPT, true);
  if (enableProseFont) {
    projectSettingsPath = writeProseEditorSettingsForProject(projectRoot);
  }
  logLine(`Created project: ${path.relative(repoRoot, projectRoot)}`);
  logLine(`- ${path.relative(repoRoot, projectJsonPath)}`);
  logLine(`- ${path.relative(repoRoot, projectPackagePath)}`);
  logLine(`- ${path.relative(repoRoot, charactersNotesPath)}`);
  logLine(`- ${path.relative(repoRoot, projectExtensionsPath)}`);
  if (projectSettingsPath) {
    logLine(`- ${path.relative(repoRoot, projectSettingsPath)}`);
  }
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
    .filter((id) => fs.existsSync(path.join(projectsDir, id, "stego-project.json")))
    .sort();
}

function resolveProject(explicitProjectId?: string): ProjectContext {
  const ids = getProjectIds();
  const projectId =
    explicitProjectId ||
    process.env.STEGO_PROJECT ||
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
    spineDir: path.join(projectRoot, config.spineDir),
    notesDir: path.join(projectRoot, config.notesDir),
    distDir: path.join(projectRoot, config.distDir),
    meta: readJson<ProjectMeta>(path.join(projectRoot, "stego-project.json"))
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

  const projectJsonPath = path.join(projectsRoot, projectId, "stego-project.json");
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
  const emptySpineState: SpineState = { ids: new Set<string>(), issues: [] };
  const spineSchema = resolveSpineSchema(project);
  const requiredMetadataState = resolveRequiredMetadata(project, runtimeConfig);
  const compileStructureState = resolveCompileStructure(project);
  issues.push(...spineSchema.issues);
  issues.push(...requiredMetadataState.issues);
  issues.push(...compileStructureState.issues);

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
      runtimeConfig,
      requiredMetadataState.requiredMetadata,
      spineSchema.schema.categories,
      spineSchema.schema.inlineIdRegex,
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

  const spineState = readSpine(project.spineDir, spineSchema.schema.categories, spineSchema.schema.inlineIdRegex);
  issues.push(...spineState.issues);

  for (const chapter of chapters) {
    issues.push(...findUnknownSpineIds(chapter.referenceIds, spineState.ids, chapter.relativePath));
  }

  return {
    chapters,
    issues,
    spineState,
    compileStructureLevels: compileStructureState.levels
  };
}

function parseChapter(
  chapterPath: string,
  runtimeConfig: WritingConfig,
  requiredMetadata: string[],
  spineCategories: SpineCategory[],
  inlineIdRegex: RegExp | null,
  compileStructureLevels: CompileStructureLevel[]
): ChapterEntry {
  const relativePath = path.relative(repoRoot, chapterPath);
  const raw = fs.readFileSync(chapterPath, "utf8");
  const { metadata, body, comments, issues } = parseMetadata(raw, chapterPath, false);

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
        `Invalid file status '${status}'. Allowed: ${runtimeConfig.allowedStatuses.join(", ")}.`,
        relativePath
      )
    );
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

  const referenceValidation = extractReferenceIds(metadata, relativePath, spineCategories);
  chapterIssues.push(...referenceValidation.issues);
  chapterIssues.push(...findInlineSpineIdMentions(body, relativePath, inlineIdRegex));
  chapterIssues.push(...validateMarkdownBody(body, chapterPath));

  return {
    path: chapterPath,
    relativePath,
    title,
    order,
    status,
    referenceIds: referenceValidation.ids,
    groupValues,
    metadata,
    body,
    comments,
    issues: chapterIssues
  };
}

function normalizeGroupingValue(
  rawValue: MetadataValue | undefined,
  relativePath: string,
  issues: Issue[],
  key: string
): string | undefined {
  if (rawValue == null || rawValue === "") {
    return undefined;
  }

  if (Array.isArray(rawValue)) {
    issues.push(makeIssue("error", "metadata", `Metadata '${key}' must be a scalar value.`, relativePath));
    return undefined;
  }

  const normalized = String(rawValue).trim();
  return normalized.length > 0 ? normalized : undefined;
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
  spineCategories: SpineCategory[]
): { ids: string[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const ids = new Set<string>();

  for (const category of spineCategories) {
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

function findInlineSpineIdMentions(body: string, relativePath: string, inlineIdRegex: RegExp | null): Issue[] {
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
  const issues: Issue[] = [];

  if (!raw.startsWith("---\n") && !raw.startsWith("---\r\n")) {
    const commentsResult = parseStegoCommentsAppendix(raw, relativePath, 1);
    if (!required) {
      return {
        metadata: {},
        body: commentsResult.bodyWithoutComments,
        comments: commentsResult.comments,
        issues: commentsResult.issues
      };
    }
    return {
      metadata: {},
      body: commentsResult.bodyWithoutComments,
      comments: commentsResult.comments,
      issues: [
        makeIssue("error", "metadata", "Missing metadata block at top of file.", relativePath),
        ...commentsResult.issues
      ]
    };
  }

  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return {
      metadata: {},
      body: raw,
      comments: [],
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

  const bodyStartLine = match[0].split(/\r?\n/).length;
  const commentsResult = parseStegoCommentsAppendix(body, relativePath, bodyStartLine);
  issues.push(...commentsResult.issues);

  return {
    metadata,
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
  const lineEnding = body.includes("\r\n") ? "\r\n" : "\n";
  const lines = body.split(/\r?\n/);
  const startMarker = "<!-- stego-comments:start -->";
  const endMarker = "<!-- stego-comments:end -->";
  const issues: Issue[] = [];

  const startIndexes = findTrimmedLineIndexes(lines, startMarker);
  const endIndexes = findTrimmedLineIndexes(lines, endMarker);

  if (startIndexes.length === 0 && endIndexes.length === 0) {
    return { bodyWithoutComments: body, comments: [], issues };
  }

  if (startIndexes.length !== 1 || endIndexes.length !== 1) {
    if (startIndexes.length !== 1) {
      issues.push(
        makeIssue(
          "error",
          "comments",
          `Expected exactly one '${startMarker}' marker.`,
          relativePath
        )
      );
    }
    if (endIndexes.length !== 1) {
      issues.push(
        makeIssue(
          "error",
          "comments",
          `Expected exactly one '${endMarker}' marker.`,
          relativePath
        )
      );
    }
    return { bodyWithoutComments: body, comments: [], issues };
  }

  const start = startIndexes[0];
  const end = endIndexes[0];
  if (end <= start) {
    issues.push(
      makeIssue(
        "error",
        "comments",
        `'${endMarker}' must appear after '${startMarker}'.`,
        relativePath,
        bodyStartLine + end
      )
    );
    return { bodyWithoutComments: body, comments: [], issues };
  }

  const blockLines = lines.slice(start + 1, end);
  const comments = parseStegoCommentThreads(blockLines, relativePath, bodyStartLine + start + 1, issues);

  let removeStart = start;
  if (removeStart > 0 && lines[removeStart - 1].trim().length === 0) {
    removeStart -= 1;
  }

  const kept = [...lines.slice(0, removeStart), ...lines.slice(end + 1)];
  while (kept.length > 0 && kept[kept.length - 1].trim().length === 0) {
    kept.pop();
  }

  return {
    bodyWithoutComments: kept.join(lineEnding),
    comments,
    issues
  };
}

function parseStegoCommentThreads(
  lines: string[],
  relativePath: string,
  baseLine: number,
  issues: Issue[]
): ParsedCommentThread[] {
  const comments: ParsedCommentThread[] = [];

  let index = 0;
  while (index < lines.length) {
    const trimmed = lines[index].trim();
    if (!trimmed) {
      index += 1;
      continue;
    }

    const headingMatch = trimmed.match(/^###\s+(CMT-\d{4})\s*$/);
    if (!headingMatch) {
      issues.push(
        makeIssue(
          "error",
          "comments",
          "Invalid comments appendix line. Expected heading like '### CMT-0001'.",
          relativePath,
          baseLine + index
        )
      );
      index += 1;
      continue;
    }

    const id = headingMatch[1];
    index += 1;
    const rowLines: string[] = [];
    const rowLineNumbers: number[] = [];
    while (index < lines.length) {
      const nextTrimmed = lines[index].trim();
      if (/^###\s+CMT-\d{4}\s*$/.test(nextTrimmed)) {
        break;
      }
      rowLines.push(lines[index]);
      rowLineNumbers.push(baseLine + index);
      index += 1;
    }

    let resolved: boolean | undefined;
    let sawMeta64 = false;
    const thread: string[] = [];
    let rowIndex = 0;

    while (rowIndex < rowLines.length) {
      const rawRow = rowLines[rowIndex];
      const lineNumber = rowLineNumbers[rowIndex];
      const trimmedRow = rawRow.trim();
      if (!trimmedRow) {
        rowIndex += 1;
        continue;
      }

      if (thread.length > 0) {
        issues.push(
          makeIssue(
            "error",
            "comments",
            `Multiple message blocks found for ${id}. Create a new CMT id for each reply.`,
            relativePath,
            lineNumber
          )
        );
        break;
      }

      if (!sawMeta64) {
        const metaMatch = trimmedRow.match(/^<!--\s*meta64:\s*(\S+)\s*-->\s*$/);
        if (!metaMatch) {
          issues.push(
            makeIssue(
              "error",
              "comments",
              `Invalid comment metadata row '${trimmedRow}'. Expected '<!-- meta64: <base64url-json> -->'.`,
              relativePath,
              lineNumber
            )
          );
          rowIndex += 1;
          continue;
        }

        sawMeta64 = true;
        const decoded = decodeCommentMeta64(metaMatch[1], id, relativePath, lineNumber, issues);
        if (decoded) {
          resolved = decoded.resolved;
        }
        rowIndex += 1;
        continue;
      }

      const headerQuote = extractQuotedLine(rawRow);
      if (headerQuote === undefined) {
        issues.push(
          makeIssue(
            "error",
            "comments",
            `Invalid thread header '${trimmedRow}'. Expected blockquote header like '> _timestamp | author_'.`,
            relativePath,
            lineNumber
          )
        );
        rowIndex += 1;
        continue;
      }

      const header = parseThreadHeader(headerQuote);
      if (!header) {
        issues.push(
          makeIssue(
            "error",
            "comments",
            `Invalid thread header '${headerQuote.trim()}'. Expected '> _timestamp | author_'.`,
            relativePath,
            lineNumber
          )
        );
        rowIndex += 1;
        continue;
      }

      rowIndex += 1;
      while (rowIndex < rowLines.length) {
        const separatorRaw = rowLines[rowIndex];
        const separatorTrimmed = separatorRaw.trim();
        if (!separatorTrimmed) {
          rowIndex += 1;
          continue;
        }

        const separatorQuote = extractQuotedLine(separatorRaw);
        if (separatorQuote !== undefined && separatorQuote.trim().length === 0) {
          rowIndex += 1;
        }
        break;
      }

      const messageLines: string[] = [];
      while (rowIndex < rowLines.length) {
        const messageRaw = rowLines[rowIndex];
        const messageLineNumber = rowLineNumbers[rowIndex];
        const messageTrimmed = messageRaw.trim();
        if (!messageTrimmed) {
          rowIndex += 1;
          if (messageLines.length > 0) {
            break;
          }
          continue;
        }

        const messageQuote = extractQuotedLine(messageRaw);
        if (messageQuote === undefined) {
          issues.push(
            makeIssue(
              "error",
              "comments",
              `Invalid thread line '${messageTrimmed}'. Expected blockquote content starting with '>'.`,
              relativePath,
              messageLineNumber
            )
          );
          rowIndex += 1;
          if (messageLines.length > 0) {
            break;
          }
          continue;
        }

        if (parseThreadHeader(messageQuote)) {
          break;
        }

        messageLines.push(messageQuote);
        rowIndex += 1;
      }

      while (messageLines.length > 0 && messageLines[messageLines.length - 1].trim().length === 0) {
        messageLines.pop();
      }

      if (messageLines.length === 0) {
        issues.push(
          makeIssue(
            "error",
            "comments",
            `Thread entry for comment ${id} is missing message text.`,
            relativePath,
            lineNumber
          )
        );
        continue;
      }

      const message = messageLines.join("\n").trim();
      thread.push(`${header.timestamp} | ${header.author} | ${message}`);
    }

    if (!sawMeta64) {
      issues.push(
        makeIssue(
          "error",
          "comments",
          `Comment ${id} is missing metadata row ('<!-- meta64: <base64url-json> -->').`,
          relativePath
        )
      );
      resolved = false;
    }

    if (thread.length === 0) {
      issues.push(
        makeIssue(
          "error",
          "comments",
          `Comment ${id} is missing valid blockquote thread entries.`,
          relativePath
        )
      );
    }

    comments.push({ id, resolved: Boolean(resolved), thread });
  }

  return comments;
}

function decodeCommentMeta64(
  encoded: string,
  commentId: string,
  relativePath: string,
  lineNumber: number,
  issues: Issue[]
): { resolved: boolean } | undefined {
  let rawJson = "";
  try {
    rawJson = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    issues.push(
      makeIssue(
        "error",
        "comments",
        `Invalid meta64 payload for comment ${commentId}; expected base64url-encoded JSON.`,
        relativePath,
        lineNumber
      )
    );
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    issues.push(
      makeIssue(
        "error",
        "comments",
        `Invalid meta64 JSON for comment ${commentId}.`,
        relativePath,
        lineNumber
      )
    );
    return undefined;
  }

  if (!isPlainObject(parsed)) {
    issues.push(
      makeIssue(
        "error",
        "comments",
        `Invalid meta64 object for comment ${commentId}.`,
        relativePath,
        lineNumber
      )
    );
    return undefined;
  }

  const allowedKeys = new Set(["status", "anchor", "paragraph_index", "signature", "excerpt"]);
  for (const key of Object.keys(parsed)) {
    if (!allowedKeys.has(key)) {
      issues.push(
        makeIssue(
          "error",
          "comments",
          `meta64 for comment ${commentId} contains unsupported key '${key}'.`,
          relativePath,
          lineNumber
        )
      );
      return undefined;
    }
  }

  const status = typeof parsed.status === "string" ? parsed.status.trim().toLowerCase() : "";
  if (status !== "open" && status !== "resolved") {
    issues.push(
      makeIssue(
        "error",
        "comments",
        `meta64 for comment ${commentId} must include status 'open' or 'resolved'.`,
        relativePath,
        lineNumber
      )
    );
    return undefined;
  }

  return { resolved: status === "resolved" };
}

function extractQuotedLine(raw: string): string | undefined {
  const quoteMatch = raw.match(/^\s*>\s?(.*)$/);
  if (!quoteMatch) {
    return undefined;
  }

  return quoteMatch[1];
}

function parseThreadHeader(value: string): { timestamp: string; author: string } | undefined {
  const match = value.trim().match(/^_(.+?)\s*\|\s*(.+?)_\s*$/);
  if (!match) {
    return undefined;
  }

  const timestamp = match[1].trim();
  const author = match[2].trim();
  if (!timestamp || !author) {
    return undefined;
  }

  return { timestamp, author };
}

function findTrimmedLineIndexes(lines: string[], marker: string): number[] {
  const indexes: number[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() === marker) {
      indexes.push(index);
    }
  }
  return indexes;
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

function readSpine(
  spineDir: string,
  spineCategories: SpineCategory[],
  inlineIdRegex: RegExp | null
): SpineState {
  const issues: Issue[] = [];
  const ids = new Set<string>();

  if (spineCategories.length === 0) {
    return { ids, issues };
  }

  if (!fs.existsSync(spineDir)) {
    issues.push(makeIssue("warning", "continuity", `Missing spine directory: ${spineDir}`));
    return { ids, issues };
  }

  for (const category of spineCategories) {
    const fullPath = path.join(spineDir, category.notesFile);
    const relativePath = path.relative(repoRoot, fullPath);

    if (!fs.existsSync(fullPath)) {
      issues.push(
        makeIssue(
          "warning",
          "continuity",
          `Missing spine file '${category.notesFile}' for category '${category.key}'.`,
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

function findUnknownSpineIds(referenceIds: string[], knownIds: Set<string>, relativePath: string): Issue[] {
  const issues: Issue[] = [];

  for (const id of referenceIds) {
    if (!knownIds.has(id)) {
      issues.push(
        makeIssue("warning", "continuity", `Metadata reference '${id}' does not exist in the spine files.`, relativePath)
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
          `File status '${chapter.status}' is below required stage '${policy.minimumChapterStatus}'.`,
          chapter.relativePath
        )
      );
    }

    if (stage === "final" && chapter.status !== "final") {
      issues.push(makeIssue("error", "stage", "Final stage requires all chapters to be status 'final'.", chapter.relativePath));
    }

    if (policy.requireResolvedComments) {
      const unresolvedComments = chapter.comments.filter((comment) => !comment.resolved);
      if (unresolvedComments.length > 0) {
        const unresolvedLabel = unresolvedComments.slice(0, 5).map((comment) => comment.id).join(", ");
        const remainder = unresolvedComments.length > 5 ? ` (+${unresolvedComments.length - 5} more)` : "";
        issues.push(
          makeIssue(
            "error",
            "comments",
            `Unresolved comments (${unresolvedComments.length}): ${unresolvedLabel}${remainder}. Resolve or clear comments before stage '${stage}'.`,
            chapter.relativePath
          )
        );
      }
    }
  }

  if (policy.requireSpine) {
    for (const spineIssue of report.issues.filter((issue) => issue.category === "continuity")) {
      if (spineIssue.message.startsWith("Missing spine file")) {
        issues.push({ ...spineIssue, level: "error" });
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
  const spineWords = collectSpineWordsForSpellcheck(report.spineState.ids);

  if (policy.enforceMarkdownlint) {
    issues.push(...runMarkdownlint(project, chapterPaths, true));
  } else {
    issues.push(...runMarkdownlint(project, chapterPaths, false));
  }

  if (policy.enforceCSpell) {
    issues.push(...runCSpell(chapterPaths, true, spineWords));
  } else {
    issues.push(...runCSpell(chapterPaths, false, spineWords));
  }

  return { chapters: report.chapters, issues };
}

function runMarkdownlint(project: ProjectContext, files: string[], required: boolean): Issue[] {
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

  const projectConfigPath = path.join(project.root, ".markdownlint.json");
  const markdownlintConfigPath = fs.existsSync(projectConfigPath)
    ? projectConfigPath
    : path.join(repoRoot, ".markdownlint.json");

  const prepared = prepareFilesWithoutComments(files);
  try {
    const result = spawnSync(
      markdownlintCommand,
      ["--config", markdownlintConfigPath, ...prepared.files],
      {
        cwd: repoRoot,
        encoding: "utf8"
      }
    );

    if (result.status === 0) {
      return [];
    }

    const details = remapToolOutputPaths(compactToolOutput(result.stdout, result.stderr), prepared.pathMap);
    return [makeIssue(required ? "error" : "warning", "lint", `markdownlint reported issues. ${details}`)];
  } finally {
    prepared.cleanup();
  }
}

function collectSpineWordsForSpellcheck(ids: Set<string>): string[] {
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

  const prepared = prepareFilesWithoutComments(files);
  try {
    const result = spawnSync(
      cspellCommand,
      ["--no-progress", "--no-summary", "--config", cspellConfigPath, ...prepared.files],
      {
        cwd: repoRoot,
        encoding: "utf8"
      }
    );

    if (result.status === 0) {
      return [];
    }

    const details = remapToolOutputPaths(compactToolOutput(result.stdout, result.stderr), prepared.pathMap);
    return [
      makeIssue(
        required ? "error" : "warning",
        "spell",
        `cspell reported issues. ${details} Words from spine identifiers are auto-whitelisted. For additional terms, add them to '.cspell.json' under the 'words' array.`
      )
    ];
  } finally {
    prepared.cleanup();
    if (tempConfigDir) {
      fs.rmSync(tempConfigDir, { recursive: true, force: true });
    }
  }
}

function prepareFilesWithoutComments(files: string[]): {
  files: string[];
  pathMap: Map<string, string>;
  cleanup: () => void;
} {
  if (files.length === 0) {
    return {
      files,
      pathMap: new Map<string, string>(),
      cleanup: () => undefined
    };
  }

  const tempDir = fs.mkdtempSync(path.join(repoRoot, ".stego-tooling-"));
  const pathMap = new Map<string, string>();
  const preparedFiles: string[] = [];

  for (let index = 0; index < files.length; index += 1) {
    const filePath = files[index];
    const raw = fs.readFileSync(filePath, "utf8");
    const relativePath = path.relative(repoRoot, filePath);
    const parsed = parseStegoCommentsAppendix(raw, relativePath, 1);
    const sanitized = parsed.bodyWithoutComments.endsWith("\n")
      ? parsed.bodyWithoutComments
      : `${parsed.bodyWithoutComments}\n`;

    const relativeTarget = relativePath.startsWith("..")
      ? `external/file-${index + 1}-${path.basename(filePath)}`
      : relativePath;
    const targetPath = path.join(tempDir, relativeTarget);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, sanitized, "utf8");

    preparedFiles.push(targetPath);
    pathMap.set(targetPath, filePath);
  }

  return {
    files: preparedFiles,
    pathMap,
    cleanup: () => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  };
}

function remapToolOutputPaths(output: string, pathMap: Map<string, string>): string {
  if (!output || pathMap.size === 0) {
    return output;
  }

  let mapped = output;
  for (const [preparedPath, originalPath] of pathMap.entries()) {
    if (preparedPath === originalPath) {
      continue;
    }
    mapped = mapped.split(preparedPath).join(originalPath);

    const preparedRelative = path.relative(repoRoot, preparedPath);
    const originalRelative = path.relative(repoRoot, originalPath);
    const preparedRelativeNormalized = preparedRelative.split(path.sep).join("/");
    const originalRelativeNormalized = originalRelative.split(path.sep).join("/");
    mapped = mapped.split(preparedRelative).join(originalRelative);
    mapped = mapped.split(preparedRelativeNormalized).join(originalRelativeNormalized);
  }

  return mapped;
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

function buildManuscript(
  project: ProjectContext,
  chapters: ChapterEntry[],
  compileStructureLevels: CompileStructureLevel[]
): string {
  fs.mkdirSync(project.distDir, { recursive: true });

  const generatedAt = new Date().toISOString();
  const title = project.meta.title || project.id;
  const subtitle = project.meta.subtitle || "";
  const author = project.meta.author || "";
  const tocEntries: Array<{ level: number; heading: string }> = [];
  const previousGroupValues = new Map<string, string | undefined>();
  const previousGroupTitles = new Map<string, string | undefined>();
  const entryHeadingLevel = Math.min(6, 2 + compileStructureLevels.length);

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

  if (compileStructureLevels.length === 0) {
    lines.push(`- [Manuscript](#${slugify("Manuscript")})`);
  }

  lines.push("");

  for (let chapterIndex = 0; chapterIndex < chapters.length; chapterIndex += 1) {
    const entry = chapters[chapterIndex];
    let insertedBreakForEntry = false;
    const levelChanged: boolean[] = [];

    for (let levelIndex = 0; levelIndex < compileStructureLevels.length; levelIndex += 1) {
      const level = compileStructureLevels[levelIndex];
      const explicitValue = entry.groupValues[level.key];
      const previousValue = previousGroupValues.get(level.key);
      const currentValue = explicitValue ?? previousValue;
      const explicitTitle = level.titleKey ? toScalarMetadataString(entry.metadata[level.titleKey]) : undefined;
      const previousTitle = previousGroupTitles.get(level.key);
      const currentTitle = explicitTitle ?? previousTitle;
      const parentChanged = levelIndex > 0 && levelChanged[levelIndex - 1] === true;
      const changed = parentChanged || currentValue !== previousValue;
      levelChanged.push(changed);

      if (!changed || !currentValue) {
        previousGroupValues.set(level.key, currentValue);
        previousGroupTitles.set(level.key, currentTitle);
        continue;
      }

      if (level.pageBreak === "between-groups" && chapterIndex > 0 && !insertedBreakForEntry) {
        lines.push("\\newpage");
        lines.push("");
        insertedBreakForEntry = true;
      }

      if (level.injectHeading) {
        const heading = formatCompileStructureHeading(level, currentValue, currentTitle);
        tocEntries.push({ level: levelIndex, heading });
        const headingLevel = Math.min(6, 2 + levelIndex);
        lines.push(`${"#".repeat(headingLevel)} ${heading}`);
        lines.push("");
      }

      previousGroupValues.set(level.key, currentValue);
      previousGroupTitles.set(level.key, currentTitle);
    }

    lines.push(`${"#".repeat(entryHeadingLevel)} ${entry.title}`);
    lines.push("");
    lines.push(`<!-- source: ${entry.relativePath} | order: ${entry.order} | status: ${entry.status} -->`);
    lines.push("");
    lines.push(entry.body.trim());
    lines.push("");
  }

  if (tocEntries.length > 0) {
    const tocStart = lines.indexOf("## Table of Contents");
    if (tocStart >= 0) {
      const insertAt = tocStart + 2;
      const tocLines = tocEntries.map((entry) => `${"  ".repeat(entry.level)}- [${entry.heading}](#${slugify(entry.heading)})`);
      lines.splice(insertAt, 0, ...tocLines);
    }
  }

  const outputPath = path.join(project.distDir, `${project.id}.md`);
  fs.writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");
  return outputPath;
}

function formatCompileStructureHeading(
  level: CompileStructureLevel,
  value: string,
  title: string | undefined
): string {
  const resolvedTitle = title || "";
  if (!resolvedTitle && level.headingTemplate === "{label} {value}: {title}") {
    return `${level.label} ${value}`;
  }

  return level.headingTemplate
    .replaceAll("{label}", level.label)
    .replaceAll("{value}", value)
    .replaceAll("{title}", resolvedTitle)
    .replace(/\s+/g, " ")
    .replace(/:\s*$/, "")
    .trim();
}

function toScalarMetadataString(rawValue: MetadataValue | undefined): string | undefined {
  if (rawValue == null || rawValue === "" || Array.isArray(rawValue)) {
    return undefined;
  }

  const normalized = String(rawValue).trim();
  return normalized.length > 0 ? normalized : undefined;
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

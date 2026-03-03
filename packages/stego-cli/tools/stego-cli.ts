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
import { parseCommentAppendix } from "./comments/comment-domain.ts";
import { runCommentsCommand } from "./comments/comments-command.ts";
import { CommentsCommandError } from "./comments/errors.ts";
import { runMetadataCommand } from "./metadata/metadata-command.ts";
import { runSpineCommand } from "./spine/spine-command.ts";
import { readSpineCatalog } from "./spine/spine-domain.ts";

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
  entries: Set<string>;
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
  referenceKeysByCategory: Record<string, string[]>;
  groupValues: Record<string, string>;
  metadata: Metadata;
  body: string;
  comments: ParsedCommentThread[];
  issues: Issue[];
}

interface ManuscriptOrderEntry {
  order: number;
  filename: string;
}

interface SpineState {
  categories: SpineCategory[];
  entriesByCategory: Map<string, Set<string>>;
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

interface WorkspaceContext {
  repoRoot: string;
  configPath: string;
  config: WritingConfig;
}

interface LintSelection {
  manuscript: boolean;
  spine: boolean;
}

const STATUS_RANK: Record<StageName, number> = {
  draft: 0,
  revise: 1,
  "line-edit": 2,
  proof: 3,
  final: 4
};
const RESERVED_COMMENT_PREFIX = "CMT";
const DEFAULT_NEW_MANUSCRIPT_SLUG = "new-document";
const ROOT_CONFIG_FILENAME = "stego.config.json";
const PROSE_FONT_PROMPT = "Switch workspace to proportional (prose-style) font? (recommended)";
const COMMENT_AUTHOR_PROMPT = "Default comment author for stego.comments.author?";
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
- \`projects/\` demo projects (\`stego-docs\` and \`fiction-example\`)
- root \`package.json\` scripts for Stego commands
- root \`.vscode/tasks.json\` tasks for common workflows

Full documentation lives in \`projects/stego-docs\`.

## First run

\`\`\`bash
npm install
stego list-projects
\`\`\`

## Run commands for a specific project (from workspace root)

\`\`\`bash
stego validate --project fiction-example
stego build --project fiction-example
stego check-stage --project fiction-example --stage revise
stego export --project fiction-example --format md
stego new --project fiction-example
\`\`\`

## Work inside one project

Each project also has local scripts, so you can run commands from inside a project directory:

\`\`\`bash
cd projects/fiction-example
npm run validate
npm run build
\`\`\`

## VS Code recommendation

When you are actively working on one project, open that project directory directly in VS Code (for example \`projects/fiction-example\`).

This keeps your editor context focused and applies the project's recommended extensions (including Stego + Saurus) for that project.

## Create a new project

\`\`\`bash
stego new-project --project my-book --title "My Book"
\`\`\`

## Add a new manuscript file

\`\`\`bash
stego new --project fiction-example
\`\`\`
`;
const SCAFFOLD_AGENTS_CONTENT = `# AGENTS.md

## Purpose

This workspace is designed to be AI-friendly for writing workflows.

## Canonical CLI Interface

- Run \`stego --help\` for the full command reference.
- Run \`stego --version\` to confirm which CLI is active.
- Run project docs commands in \`projects/stego-docs\` when available.

## CLI Resolution Rules

- Prefer local CLI over global CLI:
  - \`npm exec -- stego ...\`
  - \`npx --no-install stego ...\`
- At the start of mutation tasks, run \`stego --version\` and report the version used.

## Workspace Discovery Checklist

1. Confirm workspace root contains \`stego.config.json\`.
2. Run \`stego list-projects\`.
3. Use explicit \`--project <id>\` for project-scoped commands.

## CLI-First Policy (Required)

When asked to edit Stego project content, use documented Stego CLI commands first.

Typical targets:

- manuscript files
- spine categories and entries
- frontmatter metadata
- comments
- stage/build/export workflows

Preferred commands include:

- \`stego new\`
- \`stego spine read\`
- \`stego spine new-category\`
- \`stego spine new\`
- \`stego metadata read\`
- \`stego metadata apply\`
- \`stego comments ...\`

## Machine-Mode Output

- For automation and integrations, prefer \`--format json\` and parse structured output.
- Use text output only for human-facing summaries.

## Mutation Protocol

1. Read current state first (\`metadata read\`, \`spine read\`, \`comments read\`).
2. Mutate via CLI commands.
3. Verify after writes (\`stego validate --project <id>\` and relevant read commands).

## Manual Edit Fallback

Manual file edits are a last resort.

If manual edits are required, the agent must:

1. warn that CLI was bypassed,
2. explain why CLI could not be used, and
3. list which files were manually edited.

## Failure Contract

When CLI fails:

1. show the attempted command,
2. summarize the error briefly,
3. report the recovery attempt, and
4. if fallback is required, apply the Manual Edit Fallback policy.

## Validation Expectations

After mutations, run relevant checks when feasible (for example \`stego validate --project <id>\`) and report results.

## Scope Guardrails

- Do not manually edit \`dist/\` outputs or compiled export artifacts.
- Do not modify files outside the requested project scope unless the user explicitly asks.

## Task To Command Quick Map

- New manuscript: \`stego new --project <id> [--filename <name>]\`
- Read spine: \`stego spine read --project <id> --format json\`
- New spine category: \`stego spine new-category --project <id> --key <category>\`
- New spine entry: \`stego spine new --project <id> --category <category> [--filename <path>]\`
- Read metadata: \`stego metadata read <markdown-path> --format json\`
- Apply metadata: \`stego metadata apply <markdown-path> --input <path|-> --format json\`
- Read comments: \`stego comments read <manuscript> --format json\`
- Mutate comments: \`stego comments add|reply|set-status|delete|clear-resolved|sync-anchors ... --format json\`
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
  "matt-gold.saurus-extension",
  "streetsidesoftware.code-spell-checker"
] as const;
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..");
let repoRoot = "";
let config!: WritingConfig;

void main();

async function main(): Promise<void> {
  const { command, options } = parseArgs(process.argv.slice(2));

  if (command === "version" || command === "--version" || command === "-v") {
    const cliPackage = readJson<Record<string, unknown>>(path.join(packageRoot, "package.json"));
    const version = typeof cliPackage.version === "string" ? cliPackage.version : "0.0.0";
    console.log(version);
    return;
  }

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
        await createProject({
          projectId: readStringOption(options, "project"),
          title: readStringOption(options, "title"),
          proseFont: readStringOption(options, "prose-font"),
          outputFormat: readStringOption(options, "format")
        });
        return;
      case "new": {
        activateWorkspace(options);
        const project = resolveProject(readStringOption(options, "project"));
        const createdPath = createNewManuscript(
          project,
          readStringOption(options, "i"),
          readStringOption(options, "filename")
        );
        const outputFormat = parseTextOrJsonFormat(readStringOption(options, "format"));
        if (outputFormat === "json") {
          process.stdout.write(
            `${JSON.stringify(
              {
                ok: true,
                operation: "new",
                result: {
                  projectId: project.id,
                  filePath: createdPath
                }
              },
              null,
              2
            )}\n`
          );
        } else {
          logLine(`Created manuscript: ${createdPath}`);
        }
        return;
      }
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
      case "lint": {
        activateWorkspace(options);
        const project = resolveProject(readStringOption(options, "project"));
        const selection = resolveLintSelection(options);
        const result = runProjectLint(project, selection);
        printReport(result.issues);
        exitIfErrors(result.issues);
        const scopeLabel = formatLintSelection(selection);
        const fileLabel = result.fileCount === 1 ? "file" : "files";
        logLine(`Lint passed for '${project.id}' (${scopeLabel}, ${result.fileCount} ${fileLabel}).`);
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
      case "comments":
        await runCommentsCommand(options, process.cwd());
        return;
      case "metadata":
        await runMetadataCommand(options, process.cwd());
        return;
      case "spine": {
        activateWorkspace(options);
        const project = resolveProject(readStringOption(options, "project"));
        runSpineCommand(options, {
          id: project.id,
          root: project.root,
          spineDir: project.spineDir,
          meta: project.meta
        });
        return;
      }
      default:
        throw new Error(`Unknown command '${command}'. Run with 'help' for usage.`);
    }
  } catch (error: unknown) {
    if (error instanceof CommentsCommandError) {
      if (error.outputFormat === "json") {
        console.error(JSON.stringify(error.toJson(), null, 2));
      } else {
        console.error(`ERROR: ${error.message}`);
      }
      process.exit(error.exitCode);
    }

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

function parseTextOrJsonFormat(raw: string | undefined): "text" | "json" {
  if (!raw || raw === "text") {
    return "text";
  }
  if (raw === "json") {
    return "json";
  }
  throw new Error("Invalid --format value. Use 'text' or 'json'.");
}

function parseProseFontMode(raw: string | undefined): "yes" | "no" | "prompt" {
  const normalized = (raw || "prompt").trim().toLowerCase();
  if (normalized === "yes" || normalized === "true" || normalized === "y") {
    return "yes";
  }
  if (normalized === "no" || normalized === "false" || normalized === "n") {
    return "no";
  }
  if (normalized === "prompt" || normalized === "ask") {
    return "prompt";
  }
  throw new Error("Invalid --prose-font value. Use 'yes', 'no', or 'prompt'.");
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

    const pageBreakRaw = typeof entry.pageBreak === "string" ? entry.pageBreak.trim() : "between-groups";
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseArgs(argv: string[]): ParseArgsResult {
  const [command, ...rest] = argv;
  const options: ParsedOptions = { _: [] };

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token === "--") {
      options._.push(...rest.slice(i + 1));
      break;
    }

    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = rest[i + 1];

      if (!next || !canBeOptionValue(next)) {
        options[key] = true;
        continue;
      }

      options[key] = next;
      i += 1;
      continue;
    }

    if (token.startsWith("-") && token.length > 1) {
      const key = token.slice(1);
      const next = rest[i + 1];

      if (!next || !canBeOptionValue(next)) {
        options[key] = true;
        continue;
      }

      options[key] = next;
      i += 1;
      continue;
    }

    if (!token.startsWith("--")) {
      options._.push(token);
      continue;
    }
  }

  return { command, options };
}

function canBeOptionValue(token: string): boolean {
  if (token === "-") {
    return true;
  }

  return !token.startsWith("-");
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
  writeScaffoldAgents(targetRoot, copiedPaths);
  copyTemplateAsset(".markdownlint.json", targetRoot, copiedPaths);
  copyTemplateAsset(".markdownlint.manuscript.json", targetRoot, copiedPaths);
  copyTemplateAsset(".cspell.json", targetRoot, copiedPaths);
  copyTemplateAsset(ROOT_CONFIG_FILENAME, targetRoot, copiedPaths);
  copyTemplateAsset("projects", targetRoot, copiedPaths);
  copyTemplateAsset(path.join(".vscode", "tasks.json"), targetRoot, copiedPaths);
  copyTemplateAsset(path.join(".vscode", "extensions.json"), targetRoot, copiedPaths, { optional: true });

  rewriteTemplateProjectPackageScripts(targetRoot);
  const enableProseFont = await promptYesNo(PROSE_FONT_PROMPT, true);
  const suggestedCommentAuthor = resolveSuggestedCommentAuthor(targetRoot);
  const commentAuthor = (await promptText(COMMENT_AUTHOR_PROMPT, suggestedCommentAuthor)).trim();
  if (enableProseFont || commentAuthor) {
    writeProjectProseEditorSettings(targetRoot, copiedPaths, {
      enableProseFont,
      commentAuthor
    });
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
  logLine("  stego list-projects");
  logLine("  stego validate --project fiction-example");
  logLine("  stego build --project fiction-example");
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

async function promptText(question: string, defaultValue = ""): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return defaultValue;
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });
  const suffix = defaultValue ? ` [${defaultValue}] ` : " ";

  try {
    const answer = (await rl.question(`${question}${suffix}`)).trim();
    if (!answer) {
      return defaultValue;
    }
    return answer;
  } finally {
    rl.close();
  }
}

function resolveSuggestedCommentAuthor(cwd: string): string {
  const gitAuthor = spawnSync("git", ["config", "--get", "user.name"], {
    cwd,
    encoding: "utf8"
  });
  const fromGit = (gitAuthor.stdout || "").trim();
  if (gitAuthor.status === 0 && fromGit) {
    return fromGit;
  }

  try {
    const username = os.userInfo().username.trim();
    if (username) {
      return username;
    }
  } catch {
    // ignore lookup failure and fall back to empty
  }

  return "";
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

function writeScaffoldAgents(targetRoot: string, copiedPaths: string[]): void {
  const destinationPath = path.join(targetRoot, "AGENTS.md");
  fs.writeFileSync(destinationPath, SCAFFOLD_AGENTS_CONTENT, "utf8");
  copiedPaths.push("AGENTS.md");
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

    scripts.validate = "npx --no-install stego validate";
    scripts.build = "npx --no-install stego build";
    scripts["check-stage"] = "npx --no-install stego check-stage";
    scripts.export = "npx --no-install stego export";
    scripts.new = "npx --no-install stego new";

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

function writeProjectProseEditorSettings(
  targetRoot: string,
  copiedPaths: string[],
  options?: { enableProseFont?: boolean; commentAuthor?: string }
): void {
  const projectsRoot = path.join(targetRoot, "projects");
  if (!fs.existsSync(projectsRoot)) {
    return;
  }

  for (const entry of fs.readdirSync(projectsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const projectRoot = path.join(projectsRoot, entry.name);
    const settingsPath = writeProseEditorSettingsForProject(projectRoot, options);
    copiedPaths.push(path.relative(targetRoot, settingsPath));
  }
}

function writeProseEditorSettingsForProject(
  projectRoot: string,
  options?: { enableProseFont?: boolean; commentAuthor?: string }
): string {
  const vscodeDir = path.join(projectRoot, ".vscode");
  const settingsPath = path.join(vscodeDir, "settings.json");
  fs.mkdirSync(vscodeDir, { recursive: true });

  const enableProseFont = options?.enableProseFont ?? true;
  const commentAuthor = (options?.commentAuthor ?? "").trim();

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
  const nextSettings: Record<string, unknown> = {
    ...existingSettings
  };

  if (enableProseFont) {
    const existingMarkdownSettings = isPlainObject(existingSettings["[markdown]"])
      ? (existingSettings["[markdown]"] as Record<string, unknown>)
      : {};
    nextSettings["[markdown]"] = {
      ...existingMarkdownSettings,
      ...proseMarkdownSettings
    };
    nextSettings["markdown.preview.fontFamily"] = PROSE_MARKDOWN_EDITOR_SETTINGS["markdown.preview.fontFamily"];
  }

  if (commentAuthor) {
    nextSettings["stego.comments.author"] = commentAuthor;
  }

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
      new: "stego new",
      spine: "stego spine",
      metadata: "stego metadata",
      lint: "stego lint",
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
    `Stego CLI\n\nCommands:\n  init [--force]\n  list-projects [--root <path>]\n  new-project --project <project-id> [--title <title>] [--prose-font <yes|no|prompt>] [--format <text|json>] [--root <path>]\n  new --project <project-id> [--i <prefix>|-i <prefix>] [--filename <name>] [--format <text|json>] [--root <path>]\n  validate --project <project-id> [--file <project-relative-manuscript-path>] [--root <path>]\n  build --project <project-id> [--root <path>]\n  check-stage --project <project-id> --stage <draft|revise|line-edit|proof|final> [--file <project-relative-manuscript-path>] [--root <path>]\n  lint --project <project-id> [--manuscript|--spine] [--root <path>]\n  export --project <project-id> --format <md|docx|pdf|epub> [--output <path>] [--root <path>]\n  spine read --project <project-id> [--format <text|json>] [--root <path>]\n  spine new-category --project <project-id> --key <category> [--label <label>] [--require-metadata] [--format <text|json>] [--root <path>]\n  spine new --project <project-id> --category <category> [--filename <relative-path>] [--format <text|json>] [--root <path>]\n  metadata read <markdown-path> [--format <text|json>]\n  metadata apply <markdown-path> --input <path|-> [--format <text|json>]\n  comments read <manuscript> [--format <text|json>]\n  comments add <manuscript> [--message <text> | --input <path|->] [--author <name>] [--start-line <n> --start-col <n> --end-line <n> --end-col <n>] [--cursor-line <n>] [--format <text|json>]\n  comments reply <manuscript> --comment-id <CMT-####> [--message <text> | --input <path|->] [--author <name>] [--format <text|json>]\n  comments set-status <manuscript> --comment-id <CMT-####> --status <open|resolved> [--thread] [--format <text|json>]\n  comments delete <manuscript> --comment-id <CMT-####> [--format <text|json>]\n  comments clear-resolved <manuscript> [--format <text|json>]\n  comments sync-anchors <manuscript> --input <path|-> [--format <text|json>]\n`
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

async function createProject(options: {
  projectId?: string;
  title?: string;
  proseFont?: string;
  outputFormat?: string;
}): Promise<void> {
  const projectId = (options.projectId || "").trim();
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
  const manuscriptDir = path.join(projectRoot, config.chapterDir);

  const projectJson: Record<string, unknown> = {
    id: projectId,
    title: options.title?.trim() || toDisplayTitle(projectId),
    requiredMetadata: ["status"],
    compileStructure: {
      levels: [
        {
          key: "chapter",
          label: "Chapter",
          titleKey: "chapter_title",
          injectHeading: true,
          headingTemplate: "{label} {value}: {title}",
          pageBreak: "between-groups"
        }
      ]
    }
  };

  const projectJsonPath = path.join(projectRoot, "stego-project.json");
  fs.writeFileSync(projectJsonPath, `${JSON.stringify(projectJson, null, 2)}\n`, "utf8");

  const projectPackage: Record<string, unknown> = {
    name: `stego-project-${projectId}`,
    private: true,
    scripts: {
      new: "npx --no-install stego new",
      "spine:new": "npx --no-install stego spine new",
      "spine:new-category": "npx --no-install stego spine new-category",
      lint: "npx --no-install stego lint",
      validate: "npx --no-install stego validate",
      build: "npx --no-install stego build",
      "check-stage": "npx --no-install stego check-stage",
      export: "npx --no-install stego export"
    }
  };
  const projectPackagePath = path.join(projectRoot, "package.json");
  fs.writeFileSync(projectPackagePath, `${JSON.stringify(projectPackage, null, 2)}\n`, "utf8");

  const starterManuscriptPath = path.join(manuscriptDir, "100-hello-world.md");
  fs.writeFileSync(
    starterManuscriptPath,
    `---
status: draft
chapter: 1
chapter_title: Hello World
---

# Hello World

Start writing here.
`,
    "utf8"
  );

  const charactersDir = path.join(spineDir, "characters");
  fs.mkdirSync(charactersDir, { recursive: true });
  const charactersCategoryPath = path.join(charactersDir, "_category.md");
  fs.writeFileSync(
    charactersCategoryPath,
    `---
label: Characters
---

# Characters

`,
    "utf8"
  );

  const charactersEntryPath = path.join(charactersDir, "example-character.md");
  fs.writeFileSync(
    charactersEntryPath,
    `# Example Character

`,
    "utf8"
  );

  const projectExtensionsPath = path.join(projectRoot, ".vscode", "extensions.json");
  ensureProjectExtensionsRecommendations(projectRoot);
  let projectSettingsPath: string | null = null;
  const proseFontMode = parseProseFontMode(options.proseFont);
  const enableProseFont = proseFontMode === "prompt"
    ? await promptYesNo(PROSE_FONT_PROMPT, true)
    : proseFontMode === "yes";
  if (enableProseFont) {
    projectSettingsPath = writeProseEditorSettingsForProject(projectRoot);
  }
  const outputFormat = parseTextOrJsonFormat(options.outputFormat);
  if (outputFormat === "json") {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          operation: "new-project",
          result: {
            projectId,
            projectPath: path.relative(repoRoot, projectRoot),
            files: [
              path.relative(repoRoot, projectJsonPath),
              path.relative(repoRoot, projectPackagePath),
              path.relative(repoRoot, starterManuscriptPath),
              path.relative(repoRoot, charactersCategoryPath),
              path.relative(repoRoot, charactersEntryPath),
              path.relative(repoRoot, projectExtensionsPath),
              ...(projectSettingsPath ? [path.relative(repoRoot, projectSettingsPath)] : [])
            ]
          }
        },
        null,
        2
      )}\n`
    );
    return;
  }

  logLine(`Created project: ${path.relative(repoRoot, projectRoot)}`);
  logLine(`- ${path.relative(repoRoot, projectJsonPath)}`);
  logLine(`- ${path.relative(repoRoot, projectPackagePath)}`);
  logLine(`- ${path.relative(repoRoot, starterManuscriptPath)}`);
  logLine(`- ${path.relative(repoRoot, charactersCategoryPath)}`);
  logLine(`- ${path.relative(repoRoot, charactersEntryPath)}`);
  logLine(`- ${path.relative(repoRoot, projectExtensionsPath)}`);
  if (projectSettingsPath) {
    logLine(`- ${path.relative(repoRoot, projectSettingsPath)}`);
  }
}

function createNewManuscript(
  project: ProjectContext,
  requestedPrefixRaw?: string,
  requestedFilenameRaw?: string
): string {
  fs.mkdirSync(project.manuscriptDir, { recursive: true });
  const requiredMetadataState = resolveRequiredMetadata(project, config);
  const requiredMetadataErrors = requiredMetadataState.issues
    .filter((issue) => issue.level === "error")
    .map((issue) => issue.message);
  if (requiredMetadataErrors.length > 0) {
    throw new Error(
      `Unable to resolve required metadata for project '${project.id}': ${requiredMetadataErrors.join(" ")}`
    );
  }

  const existingEntries = listManuscriptOrderEntries(project.manuscriptDir);
  const explicitPrefix = parseManuscriptPrefix(requestedPrefixRaw);
  const requestedFilename = parseRequestedManuscriptFilename(requestedFilenameRaw);
  if (requestedFilename && explicitPrefix != null) {
    throw new Error("Options --filename and --i/-i cannot be used together.");
  }

  let filename: string;
  if (requestedFilename) {
    const requestedOrder = parseOrderFromManuscriptFilename(requestedFilename);
    if (requestedOrder != null) {
      const collision = existingEntries.find((entry) => entry.order === requestedOrder);
      if (collision) {
        throw new Error(
          `Manuscript prefix '${requestedOrder}' is already used by '${collision.filename}'. Choose a different filename prefix.`
        );
      }
    }
    filename = requestedFilename;
  } else {
    const nextPrefix = explicitPrefix ?? inferNextManuscriptPrefix(existingEntries);
    const collision = existingEntries.find((entry) => entry.order === nextPrefix);
    if (collision) {
      throw new Error(
        `Manuscript prefix '${nextPrefix}' is already used by '${collision.filename}'. Re-run with --i <number> to choose an unused prefix.`
      );
    }
    filename = `${nextPrefix}-${DEFAULT_NEW_MANUSCRIPT_SLUG}.md`;
  }

  const manuscriptPath = path.join(project.manuscriptDir, filename);
  if (fs.existsSync(manuscriptPath)) {
    throw new Error(`Manuscript already exists: ${filename}`);
  }

  const content = renderNewManuscriptTemplate(
    requiredMetadataState.requiredMetadata
  );
  fs.writeFileSync(manuscriptPath, content, "utf8");
  return path.relative(repoRoot, manuscriptPath);
}

function listManuscriptOrderEntries(manuscriptDir: string): ManuscriptOrderEntry[] {
  if (!fs.existsSync(manuscriptDir)) {
    return [];
  }

  return fs
    .readdirSync(manuscriptDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => {
      const match = entry.name.match(/^(\d+)[-_]/);
      if (!match) {
        return null;
      }

      return {
        order: Number(match[1]),
        filename: entry.name
      };
    })
    .filter((entry): entry is ManuscriptOrderEntry => entry !== null)
    .sort((a, b) => {
      if (a.order === b.order) {
        return a.filename.localeCompare(b.filename);
      }
      return a.order - b.order;
    });
}

function parseManuscriptPrefix(raw: string | undefined): number | undefined {
  if (raw == null) {
    return undefined;
  }

  const normalized = raw.trim();
  if (!normalized) {
    throw new Error("Option --i/-i requires a numeric value.");
  }

  if (!/^\d+$/.test(normalized)) {
    throw new Error(`Invalid manuscript prefix '${raw}'. Use a non-negative integer.`);
  }

  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Invalid manuscript prefix '${raw}'. Use a smaller integer value.`);
  }
  return parsed;
}

function parseRequestedManuscriptFilename(raw: string | undefined): string | undefined {
  if (raw == null) {
    return undefined;
  }

  const normalized = raw.trim();
  if (!normalized) {
    throw new Error("Option --filename requires a value.");
  }

  if (/[\\/]/.test(normalized)) {
    throw new Error(`Invalid filename '${raw}'. Use a filename only (no directory separators).`);
  }

  const withExtension = normalized.toLowerCase().endsWith(".md")
    ? normalized
    : `${normalized}.md`;
  const stem = withExtension.slice(0, -3).trim();
  if (!stem) {
    throw new Error(`Invalid filename '${raw}'.`);
  }

  return withExtension;
}

function parseOrderFromManuscriptFilename(filename: string): number | undefined {
  const match = filename.match(/^(\d+)[-_]/);
  if (!match) {
    return undefined;
  }
  return Number(match[1]);
}

function inferNextManuscriptPrefix(entries: ManuscriptOrderEntry[]): number {
  if (entries.length === 0) {
    return 100;
  }

  if (entries.length === 1) {
    return entries[0].order + 100;
  }

  const previous = entries[entries.length - 2].order;
  const latest = entries[entries.length - 1].order;
  const step = latest - previous;
  return latest + (step > 0 ? step : 1);
}

function renderNewManuscriptTemplate(requiredMetadata: string[]): string {
  const lines: string[] = ["---", "status: draft"];
  const seenKeys = new Set<string>(["status"]);

  for (const key of requiredMetadata) {
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
  const emptySpineState: SpineState = { categories: [], entriesByCategory: new Map<string, Set<string>>(), issues: [] };
  const requiredMetadataState = resolveRequiredMetadata(project, runtimeConfig);
  const compileStructureState = resolveCompileStructure(project);
  issues.push(...requiredMetadataState.issues);
  issues.push(...compileStructureState.issues);
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
      runtimeConfig,
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

function parseChapter(
  chapterPath: string,
  runtimeConfig: WritingConfig,
  requiredMetadata: string[],
  spineCategories: SpineCategory[],
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

  const referenceValidation = extractReferenceKeysByCategory(metadata, relativePath, spineCategories);
  chapterIssues.push(...referenceValidation.issues);
  chapterIssues.push(...validateMarkdownBody(body, chapterPath));

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

function extractReferenceKeysByCategory(
  metadata: Metadata,
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
      issues.push(
        makeIssue(
          "error",
          "metadata",
          `Metadata '${category.key}' must be an array of spine entry keys (for example: [\"matthaeus\"]).`,
          relativePath
        )
      );
      continue;
    }

    const seen = new Set<string>();
    const values: string[] = [];
    for (const entry of rawValue) {
      if (typeof entry !== "string") {
        issues.push(
          makeIssue("error", "metadata", `Metadata '${category.key}' entries must be strings.`, relativePath)
        );
        continue;
      }

      const normalized = entry.trim();
      if (!normalized) {
        issues.push(
          makeIssue("error", "metadata", `Metadata '${category.key}' contains an empty entry key.`, relativePath)
        );
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
  const lineMatch = error.match(/^Line\\s+(\\d+):\\s+([\\s\\S]+)$/);
  if (!lineMatch) {
    return makeIssue("error", "comments", error, relativePath);
  }

  const relativeLine = Number.parseInt(lineMatch[1], 10);
  const absoluteLine = Number.isFinite(relativeLine)
    ? bodyStartLine + relativeLine - 1
    : undefined;
  return makeIssue("error", "comments", lineMatch[2], relativePath, absoluteLine);
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

function readSpine(project: ProjectContext): SpineState {
  const catalog = readSpineCatalog(project.root, project.spineDir);
  const categories: SpineCategory[] = [];
  const entriesByCategory = new Map<string, Set<string>>();

  for (const category of catalog.categories) {
    const entries = new Set<string>(category.entries.map((entry) => entry.key));
    categories.push({ key: category.key, entries });
    entriesByCategory.set(category.key, entries);
  }

  const issues = catalog.issues.map((message) => makeIssue("warning", "continuity", message));
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
      issues.push(
        makeIssue(
          "warning",
          "continuity",
          `Metadata category '${categoryKey}' has references but no matching spine category directory was found in spine/.`,
          relativePath
        )
      );
      continue;
    }

    for (const value of values) {
      if (known.has(value)) {
        continue;
      }
      issues.push(
        makeIssue(
          "warning",
          "continuity",
          `Metadata reference '${categoryKey}: ${value}' does not exist in spine/${categoryKey}/.`,
          relativePath
        )
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
    if (report.spineState.categories.length === 0) {
      issues.push(
        makeIssue(
          "error",
          "continuity",
          "No spine categories found. Add at least one category under spine/<category>/ before this stage."
        )
      );
    }
    for (const spineIssue of report.issues.filter((issue) => issue.category === "continuity")) {
      if (spineIssue.message.startsWith("Missing spine directory")) {
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
  const spineWords = collectSpineWordsForSpellcheck(report.spineState.entriesByCategory);

  if (policy.enforceMarkdownlint) {
    issues.push(...runMarkdownlint(project, chapterPaths, true, "manuscript"));
  } else {
    issues.push(...runMarkdownlint(project, chapterPaths, false, "manuscript"));
  }

  if (policy.enforceCSpell) {
    issues.push(...runCSpell(chapterPaths, true, spineWords));
  } else {
    issues.push(...runCSpell(chapterPaths, false, spineWords));
  }

  return { chapters: report.chapters, issues };
}

function resolveLintSelection(options: ParsedOptions): LintSelection {
  const manuscript = readBooleanOption(options, "manuscript");
  const spine = readBooleanOption(options, "spine");

  if (!manuscript && !spine) {
    return { manuscript: true, spine: true };
  }

  return { manuscript, spine };
}

function formatLintSelection(selection: LintSelection): string {
  if (selection.manuscript && selection.spine) {
    return "manuscript + spine";
  }
  if (selection.manuscript) {
    return "manuscript";
  }
  if (selection.spine) {
    return "spine";
  }
  return "none";
}

function runProjectLint(project: ProjectContext, selection: LintSelection): { issues: Issue[]; fileCount: number } {
  const issues: Issue[] = [];
  let fileCount = 0;

  if (selection.manuscript) {
    const manuscriptFiles = collectTopLevelMarkdownFiles(project.manuscriptDir);
    if (manuscriptFiles.length === 0) {
      issues.push(makeIssue("error", "lint", `No manuscript markdown files found in ${project.manuscriptDir}`));
    } else {
      fileCount += manuscriptFiles.length;
      issues.push(...runMarkdownlint(project, manuscriptFiles, true, "manuscript"));
    }
  }

  if (selection.spine) {
    const spineLintState = collectSpineLintMarkdownFiles(project);
    issues.push(...spineLintState.issues);
    if (spineLintState.files.length > 0) {
      fileCount += spineLintState.files.length;
      issues.push(...runMarkdownlint(project, spineLintState.files, true, "default"));
    }
  }

  if (fileCount === 0 && issues.length === 0) {
    issues.push(
      makeIssue(
        "error",
        "lint",
        `No markdown files found for lint scope '${formatLintSelection(selection)}' in project '${project.id}'.`
      )
    );
  }

  return { issues, fileCount };
}

function collectSpineLintMarkdownFiles(project: ProjectContext): { files: string[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const files = new Set<string>();

  addMarkdownFilesFromDirectory(files, project.spineDir, true);
  if (!fs.existsSync(project.spineDir)) {
    issues.push(makeIssue("warning", "lint", `Missing spine directory: ${project.spineDir}`));
  }

  addMarkdownFilesFromDirectory(files, project.notesDir, true);
  if (!fs.existsSync(project.notesDir)) {
    issues.push(makeIssue("warning", "lint", `Missing notes directory: ${project.notesDir}`));
  }

  for (const file of collectTopLevelMarkdownFiles(project.root)) {
    files.add(file);
  }

  const sortedFiles = Array.from(files).sort();
  if (sortedFiles.length === 0) {
    issues.push(
      makeIssue(
        "error",
        "lint",
        `No spine/notes markdown files found in ${project.spineDir}, ${project.notesDir}, or project root.`
      )
    );
  }

  return { files: sortedFiles, issues };
}

function collectTopLevelMarkdownFiles(directory: string): string[] {
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    return [];
  }

  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.join(directory, entry.name))
    .sort();
}

function addMarkdownFilesFromDirectory(target: Set<string>, directory: string, recursive: boolean): void {
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    return;
  }

  const stack = [directory];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    const entries = fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isFile() && entry.name.endsWith(".md")) {
        target.add(fullPath);
        continue;
      }

      if (recursive && entry.isDirectory()) {
        stack.push(fullPath);
      }
    }
  }
}

function runMarkdownlint(
  project: ProjectContext,
  files: string[],
  required: boolean,
  profile: "default" | "manuscript" = "default"
): Issue[] {
  if (files.length === 0) {
    return [];
  }

  const markdownlintCommand = resolveCommand("markdownlint");
  if (!markdownlintCommand) {
    if (required) {
      return [
        makeIssue(
          "error",
          "tooling",
          "markdownlint is required for this command but not installed. Run 'npm i' in the repo root."
        )
      ];
    }
    return [];
  }

  const manuscriptProjectConfigPath = path.join(project.root, ".markdownlint.manuscript.json");
  const manuscriptRepoConfigPath = path.join(repoRoot, ".markdownlint.manuscript.json");
  const defaultProjectConfigPath = path.join(project.root, ".markdownlint.json");
  const defaultRepoConfigPath = path.join(repoRoot, ".markdownlint.json");
  const markdownlintConfigPath = profile === "manuscript"
    ? (fs.existsSync(manuscriptProjectConfigPath)
      ? manuscriptProjectConfigPath
      : fs.existsSync(manuscriptRepoConfigPath)
        ? manuscriptRepoConfigPath
        : fs.existsSync(defaultProjectConfigPath)
          ? defaultProjectConfigPath
          : defaultRepoConfigPath)
    : (fs.existsSync(defaultProjectConfigPath)
      ? defaultProjectConfigPath
      : defaultRepoConfigPath);

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

function collectSpineWordsForSpellcheck(entriesByCategory: Map<string, Set<string>>): string[] {
  const words = new Set<string>();

  for (const [category, entries] of entriesByCategory) {
    const categoryParts = category
      .split(/[-_/]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    for (const part of categoryParts) {
      if (/[A-Za-z]/.test(part)) {
        words.add(part.toLowerCase());
      }
    }

    for (const entry of entries) {
      const entryParts = entry
        .split(/[-_/]+/)
        .map((part) => part.trim())
        .filter(Boolean);
      for (const part of entryParts) {
        if (!/[A-Za-z]/.test(part)) {
          continue;
        }
        words.add(part.toLowerCase());
      }
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

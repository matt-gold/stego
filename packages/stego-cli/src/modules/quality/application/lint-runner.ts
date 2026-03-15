import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseCommentAppendix } from "@stego-labs/shared/domain/comments";
import { inferLeafFormat, isBranchFile, isSupportedLeafContentFile } from "@stego-labs/shared/domain/content";
import type { ProjectContext } from "../../project/index.ts";
import type { Issue, LintResult, LintSelection } from "../types.ts";

export function resolveLintSelection(options: Record<string, unknown>): LintSelection {
  const content = readBooleanOption(options, "content");
  const notes = readBooleanOption(options, "notes");

  if (!content && !notes) {
    return { content: true, notes: true };
  }

  return { content, notes };
}

export function formatLintSelection(selection: LintSelection): string {
  if (selection.content && selection.notes) {
    return "content + notes";
  }
  if (selection.content) {
    return "content";
  }
  if (selection.notes) {
    return "notes";
  }
  return "none";
}

export function runProjectLint(project: ProjectContext, selection: LintSelection): LintResult {
  const issues: Issue[] = [];
  let fileCount = 0;

  if (selection.content) {
    const contentFiles = collectContentLintFiles(project.contentDir);
    if (contentFiles.length === 0) {
      issues.push(makeIssue("error", "lint", `No content files found in ${project.contentDir}`));
    } else {
      fileCount += contentFiles.length;
      issues.push(...runContentLint(project, contentFiles, true));
    }
  }

  if (selection.notes) {
    const notesLintState = collectNotesLintMarkdownFiles(project);
    issues.push(...notesLintState.issues);
    if (notesLintState.files.length > 0) {
      fileCount += notesLintState.files.length;
      issues.push(...runMarkdownlint(project, notesLintState.files, true, "default"));
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

export function runMarkdownlint(
  project: ProjectContext,
  files: string[],
  required: boolean,
  profile: "default" | "manuscript" = "default"
): Issue[] {
  if (files.length === 0) {
    return [];
  }

  const markdownlintCommand = resolveCommand(project.workspace.repoRoot, "markdownlint");
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

  const repoRoot = project.workspace.repoRoot;
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

  const prepared = prepareFilesWithoutComments(project.workspace.repoRoot, files);
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

    const details = remapToolOutputPaths(
      compactToolOutput(result.stdout, result.stderr),
      prepared.pathMap,
      project.workspace.repoRoot
    );
    return [makeIssue(required ? "error" : "warning", "lint", `markdownlint reported issues. ${details}`)];
  } finally {
    prepared.cleanup();
  }
}

export function runCSpell(
  project: ProjectContext,
  files: string[],
  required: boolean,
  extraWords: string[] = []
): Issue[] {
  const cspellCommand = resolveCommand(project.workspace.repoRoot, "cspell");
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

  const repoRoot = project.workspace.repoRoot;
  let tempConfigDir: string | null = null;
  let cspellConfigPath = path.join(repoRoot, ".cspell.json");

  if (extraWords.length > 0) {
    const baseConfig = readJson<Record<string, unknown>>(cspellConfigPath);
    const existingWords = Array.isArray(baseConfig.words)
      ? baseConfig.words.filter((word): word is string => typeof word === "string")
      : [];
    const mergedWords = new Set<string>([...existingWords, ...extraWords]);

    tempConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), "stego-cspell-"));
    cspellConfigPath = path.join(tempConfigDir, "cspell.generated.json");
    fs.writeFileSync(
      cspellConfigPath,
      `${JSON.stringify({ ...baseConfig, words: Array.from(mergedWords).sort() }, null, 2)}\n`,
      "utf8"
    );
  }

  const prepared = prepareFilesWithoutComments(repoRoot, files);
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

    const details = remapToolOutputPaths(
      compactToolOutput(result.stdout, result.stderr),
      prepared.pathMap,
      repoRoot
    );
    return [
      makeIssue(
        required ? "error" : "warning",
        "spell",
        `cspell reported issues. ${details} For additional terms, add them to '.cspell.json' under the 'words' array.`
      )
    ];
  } finally {
    prepared.cleanup();
    if (tempConfigDir) {
      fs.rmSync(tempConfigDir, { recursive: true, force: true });
    }
  }
}

function collectNotesLintMarkdownFiles(project: ProjectContext): { files: string[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const files = new Set<string>();

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
        `No notes/project markdown files found in ${project.notesDir} or project root.`
      )
    );
  }

  return { files: sortedFiles, issues };
}

function collectContentLintFiles(directory: string): string[] {
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    return [];
  }

  const files = new Set<string>();
  const stack = [directory];
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

      if (entry.isFile() && (isSupportedLeafContentFile(fullPath) || isBranchFile(fullPath))) {
        files.add(fullPath);
      }
    }
  }

  return Array.from(files).sort();
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

function runContentLint(project: ProjectContext, files: string[], required: boolean): Issue[] {
  const markdownFiles = files.filter((file) => inferLeafFormat(file) === "markdown");
  const plaintextFiles = files.filter((file) => inferLeafFormat(file) === "plaintext");
  return [
    ...runMarkdownlint(project, markdownFiles, required, "manuscript"),
    ...runCSpell(project, plaintextFiles, required)
  ];
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

function prepareFilesWithoutComments(
  repoRoot: string,
  files: string[]
): {
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
    const parsed = parseCommentAppendix(raw);
    const sanitized = parsed.contentWithoutComments.endsWith("\n")
      ? parsed.contentWithoutComments
      : `${parsed.contentWithoutComments}\n`;

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

function remapToolOutputPaths(output: string, pathMap: Map<string, string>, repoRoot?: string): string {
  if (!output || pathMap.size === 0) {
    return output;
  }

  const root = repoRoot || process.cwd();
  let mapped = output;
  for (const [preparedPath, originalPath] of pathMap.entries()) {
    if (preparedPath === originalPath) {
      continue;
    }
    mapped = mapped.split(preparedPath).join(originalPath);

    const preparedRelative = path.relative(root, preparedPath);
    const originalRelative = path.relative(root, originalPath);
    const preparedRelativeNormalized = preparedRelative.split(path.sep).join("/");
    const originalRelativeNormalized = originalRelative.split(path.sep).join("/");
    mapped = mapped.split(preparedRelative).join(originalRelative);
    mapped = mapped.split(preparedRelativeNormalized).join(originalRelativeNormalized);
  }

  return mapped;
}

function resolveCommand(repoRoot: string, command: string): string | null {
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

function readJson<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing JSON file: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8");
  try {
    return JSON.parse(raw) as T;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON at ${filePath}: ${message}`);
  }
}

function readBooleanOption(options: Record<string, unknown>, key: string): boolean {
  return options[key] === true;
}

function makeIssue(
  level: Issue["level"],
  category: string,
  message: string,
  file: string | null = null,
  line: number | null = null
): Issue {
  return { level, category, message, file, line };
}

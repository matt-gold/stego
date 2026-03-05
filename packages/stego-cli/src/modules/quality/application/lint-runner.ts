import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseCommentAppendix } from "../../../../../shared/src/domain/comments/index.ts";
import type { ProjectContext } from "../../project/index.ts";
import type { Issue, LintResult, LintSelection } from "../types.ts";

export function resolveLintSelection(options: Record<string, unknown>): LintSelection {
  const manuscript = readBooleanOption(options, "manuscript");
  const spine = readBooleanOption(options, "spine");

  if (!manuscript && !spine) {
    return { manuscript: true, spine: true };
  }

  return { manuscript, spine };
}

export function formatLintSelection(selection: LintSelection): string {
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

export function runProjectLint(project: ProjectContext, selection: LintSelection): LintResult {
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

export function collectSpineWordsForSpellcheck(entriesByCategory: Map<string, Set<string>>): string[] {
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

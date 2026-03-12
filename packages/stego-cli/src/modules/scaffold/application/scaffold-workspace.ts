import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { CliError } from "@stego/shared/contracts/cli";
import { ROOT_CONFIG_FILENAME } from "../../workspace/index.ts";
import {
  COMMENT_AUTHOR_PROMPT,
  PROJECT_EXTENSION_RECOMMENDATIONS,
  PROSE_FONT_PROMPT,
  PROSE_MARKDOWN_EDITOR_SETTINGS,
  SCAFFOLD_AGENTS_CONTENT,
  SCAFFOLD_GITIGNORE_CONTENT,
  SCAFFOLD_README_CONTENT
} from "../domain/templates.ts";
import type { InitWorkspaceInput, InitWorkspaceResult } from "../types.ts";
import {
  copyDirectory,
  copyFile,
  ensureDirectory,
  listDirectoryEntries,
  pathExists,
  readTextFile,
  statPath,
  writeTextFile
} from "../infra/template-repo.ts";

export async function scaffoldWorkspace(input: InitWorkspaceInput): Promise<InitWorkspaceResult> {
  const targetRoot = path.resolve(input.cwd);
  const entries = listDirectoryEntries(targetRoot)
    .filter((entry) => entry.name !== "." && entry.name !== "..");
  if (entries.length > 0 && !input.force) {
    throw new Error(`Target directory is not empty: ${targetRoot}. Re-run with --force to continue.`);
  }

  const packageRoot = resolvePackageRoot();
  const copiedPaths: string[] = [];

  writeScaffoldGitignore(targetRoot, copiedPaths);
  writeScaffoldReadme(targetRoot, copiedPaths);
  writeScaffoldAgents(targetRoot, copiedPaths);

  copyTemplateAsset(packageRoot, ".markdownlint.json", targetRoot, copiedPaths);
  copyTemplateAsset(packageRoot, ".markdownlint.manuscript.json", targetRoot, copiedPaths);
  copyTemplateAsset(packageRoot, ".cspell.json", targetRoot, copiedPaths);
  copyTemplateAsset(packageRoot, ROOT_CONFIG_FILENAME, targetRoot, copiedPaths);
  copyTemplateAsset(packageRoot, "projects", targetRoot, copiedPaths);
  copyTemplateAsset(packageRoot, path.join(".vscode", "tasks.json"), targetRoot, copiedPaths);
  copyTemplateAsset(packageRoot, path.join(".vscode", "extensions.json"), targetRoot, copiedPaths, { optional: true });

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

  writeInitRootPackageJson(targetRoot, packageRoot);
  return {
    targetRoot,
    copiedPaths
  };
}

function resolvePackageRoot(): string {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(scriptDir, "../../../../"),
    path.resolve(scriptDir, "../../../../../../")
  ];

  for (const candidate of candidates) {
    const configPath = path.join(candidate, ROOT_CONFIG_FILENAME);
    const projectsPath = path.join(candidate, "projects");
    if (pathExists(configPath) && pathExists(projectsPath)) {
      return candidate;
    }
  }

  throw new CliError("INTERNAL_ERROR", "Unable to resolve stego-cli package root for scaffolding.");
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
      process.stdout.write("Please answer y or n.\n");
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
    return answer || defaultValue;
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
    // ignore and fall back to empty string
  }

  return "";
}

function copyTemplateAsset(
  packageRoot: string,
  sourceRelativePath: string,
  targetRoot: string,
  copiedPaths: string[],
  options?: { optional?: boolean }
): void {
  const sourcePath = path.join(packageRoot, sourceRelativePath);
  if (!pathExists(sourcePath)) {
    if (options?.optional) {
      return;
    }
    throw new Error(`Template asset is missing from stego-cli package: ${sourceRelativePath}`);
  }

  const destinationPath = path.join(targetRoot, sourceRelativePath);
  const stats = statPath(sourcePath);
  if (stats.isDirectory()) {
    copyDirectory(sourcePath, destinationPath, (currentSourcePath) =>
      shouldCopyTemplatePath(packageRoot, currentSourcePath)
    );
  } else {
    copyFile(sourcePath, destinationPath);
  }

  copiedPaths.push(sourceRelativePath);
}

function writeScaffoldGitignore(targetRoot: string, copiedPaths: string[]): void {
  writeTextFile(path.join(targetRoot, ".gitignore"), SCAFFOLD_GITIGNORE_CONTENT);
  copiedPaths.push(".gitignore");
}

function writeScaffoldReadme(targetRoot: string, copiedPaths: string[]): void {
  writeTextFile(path.join(targetRoot, "README.md"), SCAFFOLD_README_CONTENT);
  copiedPaths.push("README.md");
}

function writeScaffoldAgents(targetRoot: string, copiedPaths: string[]): void {
  writeTextFile(path.join(targetRoot, "AGENTS.md"), SCAFFOLD_AGENTS_CONTENT);
  copiedPaths.push("AGENTS.md");
}

function shouldCopyTemplatePath(packageRoot: string, currentSourcePath: string): boolean {
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
  if (!pathExists(projectsRoot)) {
    return;
  }

  for (const entry of listDirectoryEntries(projectsRoot)) {
    if (!entry.isDirectory()) {
      continue;
    }

    const projectRoot = path.join(projectsRoot, entry.name);
    const packageJsonPath = path.join(projectRoot, "package.json");
    if (!pathExists(packageJsonPath)) {
      continue;
    }

    const parsed = tryReadJsonObject(packageJsonPath) ?? {};
    const scripts = isPlainObject(parsed.scripts) ? { ...parsed.scripts } : {};
    scripts.validate = "npx --no-install stego validate";
    scripts.build = "npx --no-install stego build";
    scripts["check-stage"] = "npx --no-install stego check-stage";
    scripts.export = "npx --no-install stego export";
    scripts.new = "npx --no-install stego new";

    writeTextFile(
      packageJsonPath,
      `${JSON.stringify({ ...parsed, scripts }, null, 2)}\n`
    );
    ensureProjectExtensionsRecommendations(projectRoot);
  }
}

function ensureProjectExtensionsRecommendations(projectRoot: string): void {
  const vscodeDir = path.join(projectRoot, ".vscode");
  const extensionsPath = path.join(vscodeDir, "extensions.json");
  ensureDirectory(vscodeDir);

  let existingRecommendations: string[] = [];
  const parsed = tryReadJsonObject(extensionsPath);
  if (parsed && Array.isArray(parsed.recommendations)) {
    existingRecommendations = parsed.recommendations.filter((value): value is string => typeof value === "string");
  }

  const mergedRecommendations = [
    ...new Set<string>([...PROJECT_EXTENSION_RECOMMENDATIONS, ...existingRecommendations])
  ];
  writeTextFile(
    extensionsPath,
    `${JSON.stringify({ recommendations: mergedRecommendations }, null, 2)}\n`
  );
}

function writeProjectProseEditorSettings(
  targetRoot: string,
  copiedPaths: string[],
  options?: { enableProseFont?: boolean; commentAuthor?: string }
): void {
  const projectsRoot = path.join(targetRoot, "projects");
  if (!pathExists(projectsRoot)) {
    return;
  }

  for (const entry of listDirectoryEntries(projectsRoot)) {
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
  ensureDirectory(vscodeDir);

  const enableProseFont = options?.enableProseFont ?? true;
  const commentAuthor = (options?.commentAuthor ?? "").trim();
  const existingSettings = tryReadJsonObject(settingsPath) ?? {};
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

  writeTextFile(settingsPath, `${JSON.stringify(nextSettings, null, 2)}\n`);
  return settingsPath;
}

function writeInitRootPackageJson(targetRoot: string, packageRoot: string): void {
  const cliPackagePath = path.join(packageRoot, "package.json");
  const cliPackage = tryReadJsonObject(cliPackagePath) ?? {};
  const cliVersion = typeof cliPackage.version === "string" ? cliPackage.version : "0.1.0";
  const enginePackagePath = path.resolve(packageRoot, "..", "stego-engine", "package.json");
  const enginePackage = tryReadJsonObject(enginePackagePath) ?? {};
  const engineVersion = typeof enginePackage.version === "string" ? enginePackage.version : cliVersion;

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
      "stego-engine": `^${engineVersion}`,
      typescript: "^5.9.3",
      "@types/node": "^25.2.3",
      cspell: "^9.6.4",
      "markdownlint-cli": "^0.47.0"
    }
  };

  writeTextFile(path.join(targetRoot, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

function tryReadJsonObject(filePath: string): Record<string, unknown> | null {
  if (!pathExists(filePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readTextFile(filePath)) as unknown;
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

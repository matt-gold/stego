import fs from "node:fs";
import path from "node:path";
import type { WorkspaceContext } from "../../workspace/index.ts";

export function listProjectIds(workspace: WorkspaceContext): string[] {
  const projectsDir = path.join(workspace.repoRoot, workspace.config.projectsDir);
  if (!fs.existsSync(projectsDir)) {
    return [];
  }

  return fs.readdirSync(projectsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((projectId) => fs.existsSync(path.join(projectsDir, projectId, "stego-project.json")))
    .sort((left, right) => left.localeCompare(right));
}

export function readJsonFile<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as T;
}

export function pathExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

export function ensureDirectory(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function writeTextFile(filePath: string, contents: string): void {
  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, contents, "utf8");
}

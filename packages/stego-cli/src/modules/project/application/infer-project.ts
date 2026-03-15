import fs from "node:fs";
import path from "node:path";
import { CliError } from "@stego-labs/shared/contracts/cli";
import type { ProjectContext, ProjectMeta, ResolveProjectInput } from "../types.ts";
import { listProjectIds, readJsonFile } from "../infra/project-repo.ts";

export function resolveProjectContext(input: ResolveProjectInput): ProjectContext {
  const projectIds = listProjectIds(input.workspace);
  const projectId = resolveProjectIdCandidate(input, projectIds);

  if (!projectId) {
    throw new CliError("PROJECT_NOT_FOUND", "Project id is required. Use --project/-p <project-id>.");
  }

  const projectRoot = path.join(input.workspace.repoRoot, input.workspace.config.projectsDir, projectId);
  const projectJsonPath = path.join(projectRoot, "stego-project.json");
  if (!pathExists(projectRoot) || !pathExists(projectJsonPath)) {
    throw new CliError("PROJECT_NOT_FOUND", `Project not found: ${projectRoot}`);
  }

  let meta: ProjectMeta;
  try {
    meta = readJsonFile<ProjectMeta>(projectJsonPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CliError("INVALID_CONFIGURATION", `Invalid JSON at ${projectJsonPath}: ${message}`);
  }

  return {
    id: projectId,
    root: projectRoot,
    contentDir: path.join(projectRoot, input.workspace.config.contentDir),
    notesDir: path.join(projectRoot, input.workspace.config.notesDir),
    templatesDir: path.join(projectRoot, "templates"),
    distDir: path.join(projectRoot, input.workspace.config.distDir),
    meta,
    workspace: input.workspace
  };
}

function resolveProjectIdCandidate(input: ResolveProjectInput, ids: string[]): string | null {
  if (input.explicitProjectId) {
    return input.explicitProjectId;
  }

  const fromEnv = readEnvProjectId(input.env);
  if (fromEnv) {
    return fromEnv;
  }

  const inferredFromCwd = inferProjectIdFromCwd(input.cwd, input.workspace);
  if (inferredFromCwd) {
    return inferredFromCwd;
  }

  return ids.length === 1 ? ids[0] : null;
}

function readEnvProjectId(env: NodeJS.ProcessEnv): string | null {
  const value = env.STEGO_PROJECT || env.WRITING_PROJECT;
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function inferProjectIdFromCwd(cwd: string, workspace: ResolveProjectInput["workspace"]): string | null {
  const projectsRoot = path.resolve(workspace.repoRoot, workspace.config.projectsDir);
  const relative = path.relative(projectsRoot, path.resolve(cwd));
  if (!relative || relative === "." || relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }

  const projectId = relative.split(path.sep)[0];
  if (!projectId) {
    return null;
  }

  const projectJsonPath = path.join(projectsRoot, projectId, "stego-project.json");
  return pathExists(projectJsonPath) ? projectId : null;
}

function pathExists(filePath: string): boolean {
  return Boolean(filePath) && fs.existsSync(filePath);
}

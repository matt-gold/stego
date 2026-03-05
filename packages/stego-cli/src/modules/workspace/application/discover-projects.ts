import fs from "node:fs";
import path from "node:path";
import type { WorkspaceContext, WorkspaceProjectDescriptor } from "../types.ts";

export function discoverWorkspaceProjects(workspace: WorkspaceContext): WorkspaceProjectDescriptor[] {
  const projectsRoot = path.join(workspace.repoRoot, workspace.config.projectsDir);
  if (!fs.existsSync(projectsRoot)) {
    return [];
  }

  return fs.readdirSync(projectsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((projectId) => fs.existsSync(path.join(projectsRoot, projectId, "stego-project.json")))
    .sort((left, right) => left.localeCompare(right))
    .map((projectId) => ({
      id: projectId,
      root: path.join(projectsRoot, projectId),
      projectJsonPath: path.join(projectsRoot, projectId, "stego-project.json")
    }));
}

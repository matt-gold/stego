import type { CommandRegistry } from "../../../app/command-registry.ts";
import { writeText } from "../../../app/output-renderer.ts";
import { discoverWorkspaceProjects } from "../application/discover-projects.ts";
import { resolveWorkspaceContext } from "../application/resolve-workspace.ts";

export function registerListProjectsCommand(registry: CommandRegistry): void {
  registry.register({
    name: "list-projects",
    description: "List projects in the workspace",
    options: [
      {
        flags: "--root <path>",
        description: "Workspace root path"
      }
    ],
    action: (context) => {
      const workspace = resolveWorkspaceContext({
        cwd: context.cwd,
        rootOption: readStringOption(context.options, "root")
      });
      const projects = discoverWorkspaceProjects(workspace);

      if (projects.length === 0) {
        writeText("No projects found.");
        return;
      }

      writeText("Projects:");
      for (const project of projects) {
        writeText(`- ${project.id}`);
      }
    }
  });
}

function readStringOption(options: Record<string, unknown>, key: string): string | undefined {
  const value = options[key];
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return undefined;
}

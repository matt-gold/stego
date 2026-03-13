import type { CommandRegistry } from "../../../app/command-registry.ts";
import { writeText } from "../../../app/output-renderer.ts";
import { resolveProjectContext } from "../../project/index.ts";
import { resolveWorkspaceContext } from "../../workspace/index.ts";
import { buildTemplateProject } from "../application/build-template-project.ts";

export function registerTemplateBuildCommand(registry: CommandRegistry): void {
  registry.register({
    name: "template build",
    description: "Compile a project directly through the TSX template engine",
    options: [
      { flags: "-p, --project <project-id>", description: "Project id" },
      { flags: "--template <path>", description: "Project-relative template path" },
      { flags: "--root <path>", description: "Workspace root path" }
    ],
    action: async (context) => {
      const project = resolveProjectContext({
        workspace: resolveWorkspaceContext({
          cwd: context.cwd,
          rootOption: readStringOption(context.options, "root")
        }),
        cwd: context.cwd,
        env: context.env,
        explicitProjectId: readStringOption(context.options, "project")
      });

      const result = await buildTemplateProject(project, readStringOption(context.options, "template"));
      writeText(`Template build markdown: ${result.markdownPath}`);
      writeText(`Template render plan: ${result.renderPlanPath}`);
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

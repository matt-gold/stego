import path from "node:path";
import type { CommandRegistry } from "../../../app/command-registry.ts";
import { writeText } from "../../../app/output-renderer.ts";
import { resolveProjectContext } from "../../project/index.ts";
import { resolveWorkspaceContext } from "../../workspace/index.ts";
import { exportTemplateProject } from "../application/export-template-project.ts";

export function registerTemplateExportCommand(registry: CommandRegistry): void {
  registry.register({
    name: "template export",
    description: "Export formats through the experimental TSX template engine",
    options: [
      { flags: "-p, --project <project-id>", description: "Project id" },
      { flags: "--template <path>", description: "Project-relative template path" },
      { flags: "--format <format>", description: "md|docx|pdf|epub" },
      { flags: "--output <path>", description: "Explicit output path" },
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

      const result = await exportTemplateProject({
        project,
        templatePath: readStringOption(context.options, "template"),
        format: readStringOption(context.options, "format") || "pdf",
        explicitOutputPath: readStringOption(context.options, "output")
          || path.join(project.distDir, "exports", `${project.id}.template.${readStringOption(context.options, "format") || "pdf"}`)
      });

      writeText(`Template build markdown: ${result.markdownPath}`);
      writeText(`Template render plan: ${result.renderPlanPath}`);
      writeText(`Template export output: ${result.outputPath}`);
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

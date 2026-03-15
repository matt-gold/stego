import type { CommandRegistry } from "../../../app/command-registry.ts";
import { writeJson, writeText } from "../../../app/output-renderer.ts";
import { resolveProjectContext } from "../../project/index.ts";
import { resolveWorkspaceContext } from "../../workspace/index.ts";
import { parseContentOutputFormat, readContent } from "../application/read-content.ts";

export function registerContentReadCommand(registry: CommandRegistry): void {
  registry.register({
    name: "content read",
    description: "Read leaf content records for a project",
    options: [
      { flags: "-p, --project <project-id>", description: "Project id" },
      { flags: "--format <format>", description: "text|json" },
      { flags: "--root <path>", description: "Workspace root path" }
    ],
    action: (context) => {
      const workspace = resolveWorkspaceContext({
        cwd: context.cwd,
        rootOption: readStringOption(context.options, "root")
      });
      const project = resolveProjectContext({
        workspace,
        cwd: context.cwd,
        env: context.env,
        explicitProjectId: readStringOption(context.options, "project")
      });
      const leaves = readContent(project);
      const outputFormat = parseContentOutputFormat(readStringOption(context.options, "format"));

      if (outputFormat === "json") {
        writeJson({
          ok: true,
          operation: "content.read",
          result: {
            projectId: project.id,
            content: leaves
          }
        });
        return;
      }

      writeText(leaves.map((leaf) => `${leaf.id} ${leaf.relativePath}`).join("\n"));
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

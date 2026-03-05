import type { CommandRegistry } from "../../../app/command-registry.ts";
import { writeJson, writeText } from "../../../app/output-renderer.ts";
import { resolveProjectContext } from "../../project/index.ts";
import { resolveWorkspaceContext } from "../../workspace/index.ts";
import { readSpineCatalogForProject } from "../application/read-catalog.ts";
import { parseSpineOutputFormat } from "../infra/spine-repo.ts";

export function registerSpineReadCommand(registry: CommandRegistry): void {
  registry.register({
    name: "spine read",
    description: "Read spine catalog",
    allowUnknownOptions: true,
    options: [
      { flags: "--project <project-id>", description: "Project id" },
      { flags: "--format <format>", description: "text|json" },
      { flags: "--root <path>", description: "Workspace root path" }
    ],
    action: (context) => {
      const outputFormat = parseSpineOutputFormat(readOption(context.options, "format"));
      const project = resolveProjectContext({
        workspace: resolveWorkspaceContext({
          cwd: context.cwd,
          rootOption: readStringOption(context.options, "root")
        }),
        cwd: context.cwd,
        env: context.env,
        explicitProjectId: readStringOption(context.options, "project")
      });

      const result = readSpineCatalogForProject(project);
      if (outputFormat === "json") {
        writeJson(result);
        return;
      }

      const entryCount = result.state.categories.reduce((sum, category) => sum + category.entries.length, 0);
      writeText(`Spine categories: ${result.state.categories.length}. Entries: ${entryCount}.`);
    }
  });
}

function readOption(options: Record<string, unknown>, key: string): unknown {
  return options[key];
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

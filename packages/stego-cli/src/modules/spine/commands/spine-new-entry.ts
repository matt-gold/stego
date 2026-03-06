import { CliError } from "../../../../../shared/src/contracts/cli/index.ts";
import type { CommandRegistry } from "../../../app/command-registry.ts";
import { writeJson, writeText } from "../../../app/output-renderer.ts";
import { resolveProjectContext } from "../../project/index.ts";
import { resolveWorkspaceContext } from "../../workspace/index.ts";
import { createSpineEntryForProject } from "../application/create-entry.ts";
import { parseSpineOutputFormat } from "../infra/spine-repo.ts";

export function registerSpineNewEntryCommand(registry: CommandRegistry): void {
  registry.register({
    name: "spine new",
    description: "Create a new spine entry",
    options: [
      { flags: "-p, --project <project-id>", description: "Project id" },
      { flags: "--category <category>", description: "Category key" },
      { flags: "--filename <path>", description: "Relative entry path" },
      { flags: "--format <format>", description: "text|json" },
      { flags: "--root <path>", description: "Workspace root path" }
    ],
    action: (context) => {
      if (hasOption(context.options, "entry")) {
        throw new Error("Unknown option '--entry' for `stego spine new`. Use `--filename`.");
      }

      const category = readStringOption(context.options, "category");
      if (!category) {
        throw new CliError("INVALID_USAGE", "--category is required for `stego spine new`.");
      }

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

      const result = createSpineEntryForProject({
        project,
        category,
        filename: readStringOption(context.options, "filename")
      });

      if (outputFormat === "json") {
        writeJson(result);
        return;
      }

      writeText(`Created spine entry: ${result.result.filePath}`);
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

function hasOption(options: Record<string, unknown>, key: string): boolean {
  return Object.hasOwn(options, key);
}

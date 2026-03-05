import { CliError } from "../../../../../shared/src/contracts/cli/index.ts";
import type { CommandRegistry } from "../../../app/command-registry.ts";
import { writeJson, writeText } from "../../../app/output-renderer.ts";
import { resolveProjectContext } from "../../project/index.ts";
import { resolveWorkspaceContext } from "../../workspace/index.ts";
import { createSpineCategoryForProject } from "../application/create-category.ts";
import { parseSpineOutputFormat } from "../infra/spine-repo.ts";

export function registerSpineNewCategoryCommand(registry: CommandRegistry): void {
  registry.register({
    name: "spine new-category",
    description: "Create a new spine category",
    allowUnknownOptions: true,
    options: [
      { flags: "--project <project-id>", description: "Project id" },
      { flags: "--key <category>", description: "Category key" },
      { flags: "--label <label>", description: "Category display label" },
      { flags: "--require-metadata", description: "Append key to required metadata" },
      { flags: "--format <format>", description: "text|json" },
      { flags: "--root <path>", description: "Workspace root path" }
    ],
    action: (context) => {
      const key = readStringOption(context.options, "key");
      if (!key) {
        throw new CliError("INVALID_USAGE", "--key is required for `stego spine new-category`.");
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

      const result = createSpineCategoryForProject({
        project,
        key,
        label: readStringOption(context.options, "label"),
        requireMetadata: readBooleanOption(context.options, "requireMetadata")
      });

      if (outputFormat === "json") {
        writeJson(result);
        return;
      }

      writeText(`Created spine category '${result.result.key}' (${result.result.metadataPath}).`);
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

function readBooleanOption(options: Record<string, unknown>, key: string): boolean {
  return options[key] === true;
}

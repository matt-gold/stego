import type { CommandRegistry } from "../../../app/command-registry.ts";
import { writeJson, writeText } from "../../../app/output-renderer.ts";
import { resolveProjectContext } from "../../project/index.ts";
import { resolveWorkspaceContext } from "../../workspace/index.ts";
import { createNewManuscript, parseManuscriptOutputFormat } from "../application/create-manuscript.ts";

export function registerNewManuscriptCommand(registry: CommandRegistry): void {
  registry.register({
    name: "new",
    description: "Create a new manuscript file",
    options: [
      { flags: "-p, --project <project-id>", description: "Project id" },
      { flags: "-i, --i <prefix>", description: "Numeric filename prefix override" },
      { flags: "--filename <name>", description: "Explicit manuscript filename" },
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
      const result = createNewManuscript({
        project,
        requestedPrefixRaw: readStringOption(context.options, "i"),
        requestedFilenameRaw: readStringOption(context.options, "filename")
      });
      const outputFormat = parseManuscriptOutputFormat(readStringOption(context.options, "format"));

      if (outputFormat === "json") {
        writeJson({
          ok: true,
          operation: "new",
          result
        });
        return;
      }

      writeText(`Created manuscript: ${result.filePath}`);
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

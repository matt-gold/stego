import type { CommandRegistry } from "../../../app/command-registry.ts";
import { writeJson, writeText } from "../../../app/output-renderer.ts";
import { resolveProjectContext } from "../../project/index.ts";
import { resolveWorkspaceContext } from "../../workspace/index.ts";
import { createNewLeaf, parseNewLeafOutputFormat } from "../application/create-manuscript.ts";

export function registerNewManuscriptCommand(registry: CommandRegistry): void {
  registry.register({
    name: "new",
    description: "Create a new leaf in a content directory",
    options: [
      { flags: "-p, --project <project-id>", description: "Project id" },
      { flags: "-i, --i <prefix>", description: "Numeric filename prefix override" },
      { flags: "--filename <name>", description: "Explicit leaf filename" },
      { flags: "--dir <content-relative-dir>", description: "Leaf directory relative to content/" },
      { flags: "--id <leaf-id>", description: "Explicit leaf id" },
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
      const result = createNewLeaf({
        project,
        requestedPrefixRaw: readStringOption(context.options, "i"),
        requestedFilenameRaw: readStringOption(context.options, "filename"),
        requestedDirRaw: readStringOption(context.options, "dir"),
        requestedIdRaw: readStringOption(context.options, "id")
      });
      const outputFormat = parseNewLeafOutputFormat(readStringOption(context.options, "format"));

      if (outputFormat === "json") {
        writeJson({
          ok: true,
          operation: "new",
          result
        });
        return;
      }

      writeText(`Created leaf: ${result.filePath}`);
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

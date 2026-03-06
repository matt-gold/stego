import type { CommandRegistry } from "../../../app/command-registry.ts";
import { writeText } from "../../../app/output-renderer.ts";
import { resolveProjectContext } from "../../project/index.ts";
import { resolveWorkspaceContext } from "../../workspace/index.ts";
import { formatIssues, inspectProject, issueHasErrors } from "../application/inspect-project.ts";

export function registerValidateCommand(registry: CommandRegistry): void {
  registry.register({
    name: "validate",
    description: "Validate manuscript and project state",
    options: [
      { flags: "-p, --project <project-id>", description: "Project id" },
      { flags: "--file <path>", description: "Project-relative manuscript path" },
      { flags: "--root <path>", description: "Workspace root path" }
    ],
    action: (context) => {
      const project = resolveProjectContext({
        workspace: resolveWorkspaceContext({
          cwd: context.cwd,
          rootOption: readStringOption(context.options, "root")
        }),
        cwd: context.cwd,
        env: context.env,
        explicitProjectId: readStringOption(context.options, "project")
      });

      const report = inspectProject(project, { onlyFile: readStringOption(context.options, "file") });
      for (const line of formatIssues(report.issues)) {
        writeText(line);
      }

      if (issueHasErrors(report.issues)) {
        process.exitCode = 1;
        return;
      }

      if (report.chapters.length === 1) {
        writeText(`Validation passed for '${report.chapters[0].relativePath}'.`);
        return;
      }

      writeText(`Validation passed for '${project.id}'.`);
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

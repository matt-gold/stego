import type { CommandRegistry } from "../../../app/command-registry.ts";
import { writeText } from "../../../app/output-renderer.ts";
import { resolveProjectContext } from "../../project/index.ts";
import { resolveWorkspaceContext } from "../../workspace/index.ts";
import { formatIssues, issueHasErrors } from "../application/inspect-project.ts";
import { runStageCheck } from "../application/stage-check.ts";

export function registerCheckStageCommand(registry: CommandRegistry): void {
  registry.register({
    name: "check-stage",
    description: "Run stage-specific quality gates",
    options: [
      { flags: "-p, --project <project-id>", description: "Project id" },
      { flags: "--stage <stage>", description: "draft|revise|line-edit|proof|final" },
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
      const stage = readStringOption(context.options, "stage") || "draft";
      const requestedFile = readStringOption(context.options, "file");
      const report = runStageCheck(project, stage, requestedFile);

      for (const line of formatIssues(report.issues)) {
        writeText(line);
      }

      if (issueHasErrors(report.issues)) {
        process.exitCode = 1;
        return;
      }

      if (requestedFile && report.chapters.length === 1) {
        writeText(`Stage check passed for '${report.chapters[0].relativePath}' at stage '${stage}'.`);
        return;
      }

      writeText(`Stage check passed for '${project.id}' at stage '${stage}'.`);
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

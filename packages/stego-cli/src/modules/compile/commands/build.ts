import type { CommandRegistry } from "../../../app/command-registry.ts";
import { writeText } from "../../../app/output-renderer.ts";
import { resolveProjectContext } from "../../project/index.ts";
import { inspectProject, formatIssues, issueHasErrors } from "../../quality/index.ts";
import { resolveWorkspaceContext } from "../../workspace/index.ts";
import { compileManuscript } from "../application/compile-manuscript.ts";

export function registerBuildCommand(registry: CommandRegistry): void {
  registry.register({
    name: "build",
    description: "Compile manuscript output",
    allowUnknownOptions: true,
    options: [
      { flags: "--project <project-id>", description: "Project id" },
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

      const report = inspectProject(project);
      for (const line of formatIssues(report.issues)) {
        writeText(line);
      }

      if (issueHasErrors(report.issues)) {
        process.exitCode = 1;
        return;
      }

      const result = compileManuscript({
        project,
        chapters: report.chapters,
        compileStructureLevels: report.compileStructureLevels
      });
      writeText(`Build output: ${result.outputPath}`);
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

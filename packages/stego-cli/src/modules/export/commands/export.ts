import type { CommandRegistry } from "../../../app/command-registry.ts";
import { writeText } from "../../../app/output-renderer.ts";
import { compileManuscript } from "../../compile/index.ts";
import { resolveProjectContext } from "../../project/index.ts";
import { formatIssues, inspectProject, issueHasErrors } from "../../quality/index.ts";
import { resolveWorkspaceContext } from "../../workspace/index.ts";
import { runExport } from "../application/run-export.ts";

export function registerExportCommand(registry: CommandRegistry): void {
  registry.register({
    name: "export",
    description: "Export manuscript formats",
    allowUnknownOptions: true,
    options: [
      { flags: "--project <project-id>", description: "Project id" },
      { flags: "--format <format>", description: "md|docx|pdf|epub" },
      { flags: "--output <path>", description: "Explicit output path" },
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
      const format = (readStringOption(context.options, "format") || "md").toLowerCase();
      const report = inspectProject(project);
      for (const line of formatIssues(report.issues)) {
        writeText(line);
      }
      if (issueHasErrors(report.issues)) {
        process.exitCode = 1;
        return;
      }

      const compiled = compileManuscript({
        project,
        chapters: report.chapters,
        compileStructureLevels: report.compileStructureLevels
      });
      const exported = runExport({
        project,
        format,
        inputPath: compiled.outputPath,
        explicitOutputPath: readStringOption(context.options, "output")
      });
      writeText(`Export output: ${exported.outputPath}`);
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

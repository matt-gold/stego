import type { CommandRegistry } from "../../../app/command-registry.ts";
import { writeText } from "../../../app/output-renderer.ts";
import { resolveProjectContext } from "../../project/index.ts";
import { formatIssues, inspectProject, issueHasErrors } from "../../quality/index.ts";
import { createTemplatePlanner, exportTemplateProject } from "../../template/index.ts";
import { resolveWorkspaceContext } from "../../workspace/index.ts";

export function registerExportCommand(registry: CommandRegistry): void {
  registry.register({
    name: "export",
    description: "Export manuscript formats",
    options: [
      { flags: "-p, --project <project-id>", description: "Project id" },
      { flags: "--template <path>", description: "Project-relative template path" },
      { flags: "--format <format>", description: "md|docx|pdf|epub|latex" },
      { flags: "--output <path>", description: "Explicit output path" },
      { flags: "--root <path>", description: "Workspace root path" }
    ],
    action: async (context) => {
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
      const issues = [...report.issues];
      for (const line of formatIssues(issues)) {
        writeText(line);
      }
      if (issueHasErrors(issues)) {
        process.exitCode = 1;
        return;
      }

      const explicitTemplatePath = readStringOption(context.options, "template");
      if (explicitTemplatePath || format === "md") {
        const exported = await exportTemplateProject({
          project,
          templatePath: explicitTemplatePath,
          format,
          explicitOutputPath: readStringOption(context.options, "output"),
          artifactPaths: {
            markdownFileName: `${project.id}.md`,
            backendDocumentFileName: `${project.id}.backend-document.json`
          }
        });
        writeText(`Export build markdown: ${exported.markdownPath}`);
        writeText(`Export backend document: ${exported.backendDocumentPath}`);
        writeText(`Export output: ${exported.outputPath}`);
        return;
      }

      const planner = createTemplatePlanner(project);
      try {
        const inspection = await planner.inspectDiscoveredTemplates();
        for (const line of formatIssues(inspection.issues)) {
          writeText(line);
        }
        if (inspection.issues.some((issue) => issue.level === "error")) {
          process.exitCode = 1;
          return;
        }

        const exported = await planner.exportDiscoveredTemplate(
          format,
          readStringOption(context.options, "output"),
          inspection
        );
        writeText(`Export build markdown: ${exported.markdownPath}`);
        writeText(`Export backend document: ${exported.backendDocumentPath}`);
        writeText(`Export output: ${exported.outputPath}`);
      } finally {
        planner.dispose();
      }
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

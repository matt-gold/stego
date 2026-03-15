import type { CommandRegistry } from "../../../app/command-registry.ts";
import { writeText } from "../../../app/output-renderer.ts";
import { resolveProjectContext } from "../../project/index.ts";
import { inspectProject, formatIssues, issueHasErrors } from "../../quality/index.ts";
import { buildTemplateProject, createTemplatePlanner } from "../../template/index.ts";
import { resolveWorkspaceContext } from "../../workspace/index.ts";

export function registerBuildCommand(registry: CommandRegistry): void {
  registry.register({
    name: "build",
    description: "Compile manuscript output",
    options: [
      { flags: "-p, --project <project-id>", description: "Project id" },
      { flags: "--template <path>", description: "Project-relative template path" },
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
      if (explicitTemplatePath) {
        const result = await buildTemplateProject(
          project,
          explicitTemplatePath,
          {
            markdownFileName: `${project.id}.md`,
            renderPlanFileName: `${project.id}.render-plan.json`
          }
        );
        writeText(`Build output: ${result.markdownPath}`);
        writeText(`Build render plan: ${result.renderPlanPath}`);
        return;
      }

      const planner = createTemplatePlanner(project);
      try {
        const inspection = await planner.inspectDiscoveredTemplates();
        for (const line of formatIssues(inspection.issues)) {
          writeText(line);
        }

        const blockingTemplateIssues = inspection.issues.filter((issue) =>
          issue.level === "error" && issue.category !== "template-export-ambiguity"
        );
        if (blockingTemplateIssues.length > 0) {
          process.exitCode = 1;
          return;
        }

        const results = await planner.buildDiscoveredTemplates();
        for (const result of results) {
          writeText(`Build output (${formatTemplateTargets(result.templateName, result.declaredTargets)}): ${result.markdownPath}`);
          writeText(`Build render plan (${result.templateName}): ${result.renderPlanPath}`);
        }

        if (inspection.issues.some((issue) => issue.level === "error")) {
          process.exitCode = 1;
        }
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

function formatTemplateTargets(templateName: string, targets: readonly string[] | null): string {
  if (targets && targets.length > 0) {
    return `${templateName} | ${targets.join(",")}`;
  }
  return `${templateName} | default`;
}

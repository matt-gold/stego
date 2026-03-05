import type { CommandRegistry } from "../../../app/command-registry.ts";
import { writeText } from "../../../app/output-renderer.ts";
import { resolveProjectContext } from "../../project/index.ts";
import { resolveWorkspaceContext } from "../../workspace/index.ts";
import { formatIssues, issueHasErrors } from "../application/inspect-project.ts";
import {
  formatLintSelection,
  resolveLintSelection,
  runProjectLint
} from "../application/lint-runner.ts";

export function registerLintCommand(registry: CommandRegistry): void {
  registry.register({
    name: "lint",
    description: "Run markdown and spelling checks",
    allowUnknownOptions: true,
    options: [
      { flags: "--project <project-id>", description: "Project id" },
      { flags: "--manuscript", description: "Lint manuscript files only" },
      { flags: "--spine", description: "Lint spine/notes files only" },
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
      const selection = resolveLintSelection(context.options);
      const result = runProjectLint(project, selection);

      for (const line of formatIssues(result.issues)) {
        writeText(line);
      }

      if (issueHasErrors(result.issues)) {
        process.exitCode = 1;
        return;
      }

      const scopeLabel = formatLintSelection(selection);
      const fileLabel = result.fileCount === 1 ? "file" : "files";
      writeText(`Lint passed for '${project.id}' (${scopeLabel}, ${result.fileCount} ${fileLabel}).`);
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

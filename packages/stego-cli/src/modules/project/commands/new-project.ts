import { createInterface } from "node:readline/promises";
import type { CommandRegistry } from "../../../app/command-registry.ts";
import { writeJson, writeText } from "../../../app/output-renderer.ts";
import { createProject, parseProjectOutputFormat, parseProseFontMode } from "../application/create-project.ts";
import { resolveWorkspaceContext } from "../../workspace/index.ts";

const PROSE_FONT_PROMPT = "Switch workspace to proportional (prose-style) font? (recommended)";

export function registerNewProjectCommand(registry: CommandRegistry): void {
  registry.register({
    name: "new-project",
    description: "Create a new Stego project",
    options: [
      { flags: "-p, --project <project-id>", description: "Project id" },
      { flags: "--title <title>", description: "Project title" },
      { flags: "--prose-font <mode>", description: "yes|no|prompt" },
      { flags: "--format <format>", description: "text|json" },
      { flags: "--root <path>", description: "Workspace root path" }
    ],
    action: async (context) => {
      const workspace = resolveWorkspaceContext({
        cwd: context.cwd,
        rootOption: readStringOption(context.options, "root")
      });
      const outputFormat = parseProjectOutputFormat(readStringOption(context.options, "format"));
      const proseFontMode = parseProseFontMode(readStringOption(context.options, "proseFont", "prose-font"));
      const enableProseFont = proseFontMode === "prompt"
        ? await promptYesNo(PROSE_FONT_PROMPT, true, context.stdout, context.env)
        : proseFontMode === "yes";

      const result = createProject({
        workspace,
        projectId: readStringOption(context.options, "project"),
        title: readStringOption(context.options, "title"),
        enableProseFont
      });

      if (outputFormat === "json") {
        writeJson({
          ok: true,
          operation: "new-project",
          result
        });
        return;
      }

      writeText(`Created project: ${result.projectPath}`);
      for (const filePath of result.files) {
        writeText(`- ${filePath}`);
      }
    }
  });
}

async function promptYesNo(
  question: string,
  defaultYes: boolean,
  stdout: NodeJS.WriteStream,
  env: NodeJS.ProcessEnv
): Promise<boolean> {
  if (env.CI || !process.stdin.isTTY || !stdout.isTTY) {
    return defaultYes;
  }

  const rl = createInterface({
    input: process.stdin,
    output: stdout
  });

  const suffix = defaultYes ? " [Y/n] " : " [y/N] ";
  try {
    while (true) {
      const answer = (await rl.question(`${question}${suffix}`)).trim().toLowerCase();
      if (!answer) {
        return defaultYes;
      }
      if (answer === "y" || answer === "yes") {
        return true;
      }
      if (answer === "n" || answer === "no") {
        return false;
      }
    }
  } finally {
    rl.close();
  }
}

function readStringOption(options: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = options[key];
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "number") {
      return String(value);
    }
  }
  return undefined;
}

import type { CommandRegistry } from "../../../app/command-registry.ts";
import { writeText } from "../../../app/output-renderer.ts";
import { scaffoldWorkspace } from "../application/scaffold-workspace.ts";

export function registerInitCommand(registry: CommandRegistry): void {
  registry.register({
    name: "init",
    description: "Initialize a new Stego workspace",
    options: [
      {
        flags: "--force",
        description: "Allow init in non-empty directory"
      }
    ],
    action: async (context) => {
      const result = await scaffoldWorkspace({
        cwd: context.cwd,
        force: readBooleanOption(context.options, "force")
      });

      writeText(`Initialized Stego workspace in ${result.targetRoot}`);
      for (const relativePath of result.copiedPaths) {
        writeText(`- ${relativePath}`);
      }
      writeText("- package.json");
      writeText("");
      writeText("Next steps:");
      writeText("  npm install");
      writeText("  stego list-projects");
      writeText("  stego validate -p fiction-example");
      writeText("  stego build -p fiction-example");
    }
  });
}

function readBooleanOption(options: Record<string, unknown>, key: string): boolean {
  return options[key] === true;
}

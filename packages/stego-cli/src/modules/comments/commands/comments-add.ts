import { CliError } from "../../../../../shared/src/contracts/cli/index.ts";
import type { CommandRegistry } from "../../../app/command-registry.ts";
import { writeJson, writeText } from "../../../app/output-renderer.ts";
import { executeCommentsOperation } from "../application/comment-operations.ts";
import { parseCommentsOutputFormat } from "../infra/comments-repo.ts";

export function registerCommentsAddCommand(registry: CommandRegistry): void {
  registry.register({
    name: "comments add <manuscript>",
    description: "Add a new comment",
    allowUnknownOptions: true,
    options: [
      { flags: "--message <text>", description: "Comment text" },
      { flags: "--author <name>", description: "Comment author" },
      { flags: "--input <path>", description: "JSON payload path or '-'" },
      { flags: "--start-line <line>", description: "Anchor start line (1-based)" },
      { flags: "--start-col <col>", description: "Anchor start column (0-based)" },
      { flags: "--end-line <line>", description: "Anchor end line (1-based)" },
      { flags: "--end-col <col>", description: "Anchor end column (0-based)" },
      { flags: "--cursor-line <line>", description: "Paragraph cursor line fallback" },
      { flags: "--format <format>", description: "text|json" }
    ],
    action: (context) => {
      const manuscriptArg = context.positionals[0];
      if (!manuscriptArg) {
        throw new CliError(
          "INVALID_USAGE",
          "Manuscript path is required. Use: stego comments add <manuscript> ..."
        );
      }

      const outputFormat = parseCommentsOutputFormat(context.options.format);
      const result = executeCommentsOperation({
        subcommand: "add",
        cwd: context.cwd,
        manuscriptArg,
        options: context.options
      });

      if (outputFormat === "json") {
        writeJson(result.payload);
        return;
      }

      writeText(result.textMessage);
    }
  });
}

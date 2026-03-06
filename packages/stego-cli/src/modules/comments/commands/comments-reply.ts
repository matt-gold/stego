import { CliError } from "../../../../../shared/src/contracts/cli/index.ts";
import type { CommandRegistry } from "../../../app/command-registry.ts";
import { writeJson, writeText } from "../../../app/output-renderer.ts";
import { executeCommentsOperation } from "../application/comment-operations.ts";
import { parseCommentsOutputFormat } from "../infra/comments-repo.ts";

export function registerCommentsReplyCommand(registry: CommandRegistry): void {
  registry.register({
    name: "comments reply <manuscript>",
    description: "Reply to an existing comment",
    options: [
      { flags: "--comment-id <id>", description: "Comment id (CMT-####)" },
      { flags: "--message <text>", description: "Reply text" },
      { flags: "--author <name>", description: "Reply author" },
      { flags: "--input <path>", description: "JSON payload path or '-'" },
      { flags: "--format <format>", description: "text|json" }
    ],
    action: (context) => {
      const manuscriptArg = context.positionals[0];
      if (!manuscriptArg) {
        throw new CliError(
          "INVALID_USAGE",
          "Manuscript path is required. Use: stego comments reply <manuscript> ..."
        );
      }

      const outputFormat = parseCommentsOutputFormat(context.options.format);
      const result = executeCommentsOperation({
        subcommand: "reply",
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

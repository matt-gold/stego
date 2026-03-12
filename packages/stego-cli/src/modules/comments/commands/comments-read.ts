import { CliError } from "@stego/shared/contracts/cli";
import type { CommandRegistry } from "../../../app/command-registry.ts";
import { writeJson, writeText } from "../../../app/output-renderer.ts";
import { executeCommentsOperation } from "../application/comment-operations.ts";
import { parseCommentsOutputFormat } from "../infra/comments-repo.ts";

export function registerCommentsReadCommand(registry: CommandRegistry): void {
  registry.register({
    name: "comments read <manuscript>",
    description: "Read comments state",
    options: [
      { flags: "--format <format>", description: "text|json" }
    ],
    action: (context) => {
      const manuscriptArg = context.positionals[0];
      if (!manuscriptArg) {
        throw new CliError(
          "INVALID_USAGE",
          "Manuscript path is required. Use: stego comments read <manuscript>."
        );
      }

      const outputFormat = parseCommentsOutputFormat(context.options.format);
      const result = executeCommentsOperation({
        subcommand: "read",
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

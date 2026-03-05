import { CliError } from "../../../../../shared/src/contracts/cli/index.ts";
import type { CommandRegistry } from "../../../app/command-registry.ts";
import { writeJson, writeText } from "../../../app/output-renderer.ts";
import { executeCommentsOperation } from "../application/comment-operations.ts";
import { parseCommentsOutputFormat } from "../infra/comments-repo.ts";

export function registerCommentsClearResolvedCommand(registry: CommandRegistry): void {
  registry.register({
    name: "comments clear-resolved <manuscript>",
    description: "Clear resolved comments",
    allowUnknownOptions: true,
    options: [
      { flags: "--format <format>", description: "text|json" }
    ],
    action: (context) => {
      const manuscriptArg = context.positionals[0];
      if (!manuscriptArg) {
        throw new CliError(
          "INVALID_USAGE",
          "Manuscript path is required. Use: stego comments clear-resolved <manuscript>."
        );
      }

      const outputFormat = parseCommentsOutputFormat(context.options.format);
      const result = executeCommentsOperation({
        subcommand: "clear-resolved",
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

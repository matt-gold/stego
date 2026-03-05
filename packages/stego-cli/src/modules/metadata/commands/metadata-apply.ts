import { CliError } from "../../../../../shared/src/contracts/cli/index.ts";
import type { CommandRegistry } from "../../../app/command-registry.ts";
import { writeJson, writeText } from "../../../app/output-renderer.ts";
import { applyMetadata } from "../application/apply-metadata.ts";
import { parseMetadataOutputFormat } from "../infra/metadata-repo.ts";

export function registerMetadataApplyCommand(registry: CommandRegistry): void {
  registry.register({
    name: "metadata apply <markdown-path>",
    description: "Apply frontmatter metadata",
    options: [
      { flags: "--input <path>", description: "JSON payload path or '-'" },
      { flags: "--format <format>", description: "text|json" }
    ],
    action: (context) => {
      const markdownPath = context.positionals[0];
      if (!markdownPath) {
        throw new CliError(
          "INVALID_USAGE",
          "Markdown path is required. Use: stego metadata apply <path> --input <path|->."
        );
      }

      const inputPath = readOption(context.options, "input");
      if (typeof inputPath !== "string" || inputPath.trim().length === 0) {
        throw new CliError("INVALID_USAGE", "--input <path|-> is required for 'metadata apply'.");
      }

      const outputFormat = parseMetadataOutputFormat(readOption(context.options, "format"));
      const result = applyMetadata({
        cwd: context.cwd,
        markdownPath,
        inputPath
      });

      if (outputFormat === "json") {
        writeJson(result);
        return;
      }

      writeText(
        `${result.changed ? "Updated" : "No changes for"} metadata in ${result.state.path}.`
      );
    }
  });
}

function readOption(options: Record<string, unknown>, key: string): unknown {
  return options[key];
}

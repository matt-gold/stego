import { CliError } from "@stego/shared/contracts/cli";
import type { CommandRegistry } from "../../../app/command-registry.ts";
import { writeJson, writeText } from "../../../app/output-renderer.ts";
import { readMetadata } from "../application/read-metadata.ts";
import { parseMetadataOutputFormat } from "../infra/metadata-repo.ts";

export function registerMetadataReadCommand(registry: CommandRegistry): void {
  registry.register({
    name: "metadata read <markdown-path>",
    description: "Read frontmatter metadata",
    options: [
      { flags: "--format <format>", description: "text|json" }
    ],
    action: (context) => {
      const markdownPath = context.positionals[0];
      if (!markdownPath) {
        throw new CliError(
          "INVALID_USAGE",
          "Markdown path is required. Use: stego metadata read <path>."
        );
      }

      const outputFormat = parseMetadataOutputFormat(readOption(context.options, "format"));
      const result = readMetadata({
        cwd: context.cwd,
        markdownPath
      });

      if (outputFormat === "json") {
        writeJson(result);
        return;
      }

      const keyCount = Object.keys(result.state.frontmatter).length;
      writeText(`Read metadata for ${result.state.path} (${keyCount} keys).`);
    }
  });
}

function readOption(options: Record<string, unknown>, key: string): unknown {
  return options[key];
}

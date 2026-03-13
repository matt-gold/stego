import type { AppContext } from "./command-context.ts";
import { CommandRegistry } from "./command-registry.ts";
import { coreModules } from "../modules/index.ts";
import { CliError } from "@stego/shared/contracts/cli";
import { writeText } from "./output-renderer.ts";
import { resolveCliVersion } from "./cli-version.ts";

export type CliApp = {
  run: () => Promise<void>;
};

export function createCliApp(appContext: AppContext): CliApp {
  const registry = new CommandRegistry(appContext);

  for (const module of coreModules) {
    module.registerCommands(registry);
  }

  return {
    run: async () => {
      const [firstArg] = appContext.argv;

      if (!firstArg || isHelpRequest(firstArg)) {
        registry.showHelp();
        return;
      }

      if (isVersionRequest(firstArg)) {
        writeText(resolveCliVersion());
        return;
      }

      if (registry.tryShowCommandHelp(appContext.argv)) {
        return;
      }

      try {
        await registry.run(appContext.argv);
      } catch (error) {
        if (isNoMatchedCommandError(error)) {
          throw new CliError("INVALID_USAGE", `Unknown command '${firstArg}'. Run 'stego --help' for usage.`);
        }
        throw error;
      }
    }
  };
}

function isNoMatchedCommandError(error: unknown): boolean {
  return error instanceof Error && error.message === "NO_MATCHED_COMMAND";
}

function isHelpRequest(arg: string): boolean {
  return arg === "help" || arg === "--help" || arg === "-h";
}

function isVersionRequest(arg: string): boolean {
  return arg === "version" || arg === "--version" || arg === "-v";
}

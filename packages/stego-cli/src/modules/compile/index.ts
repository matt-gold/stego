import type { ModuleApi } from "../../app/index.ts";
import type { CommandRegistry } from "../../app/command-registry.ts";
import { registerBuildCommand } from "./commands/build.ts";

export const compileModule: ModuleApi = {
  registerCommands(registry: CommandRegistry): void {
    registerBuildCommand(registry);
  }
};

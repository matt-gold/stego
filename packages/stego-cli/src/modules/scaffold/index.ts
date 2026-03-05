import type { ModuleApi } from "../../app/index.ts";
import type { CommandRegistry } from "../../app/command-registry.ts";
import { registerInitCommand } from "./commands/init.ts";

export const scaffoldModule: ModuleApi = {
  registerCommands(registry: CommandRegistry): void {
    registerInitCommand(registry);
  }
};

export * from "./types.ts";
export * from "./application/scaffold-workspace.ts";

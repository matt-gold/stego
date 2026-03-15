import type { ModuleApi } from "../../app/index.ts";
import type { CommandRegistry } from "../../app/command-registry.ts";
import { registerContentReadCommand } from "./commands/content-read.ts";

export const contentModule: ModuleApi = {
  registerCommands(registry: CommandRegistry): void {
    registerContentReadCommand(registry);
  }
};

export * from "./types.ts";
export * from "./application/read-content.ts";

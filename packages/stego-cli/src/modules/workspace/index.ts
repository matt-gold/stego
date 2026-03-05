import type { ModuleApi } from "../../app/index.ts";
import type { CommandRegistry } from "../../app/command-registry.ts";
import { registerListProjectsCommand } from "./commands/list-projects.ts";

export const workspaceModule: ModuleApi = {
  registerCommands(registry: CommandRegistry): void {
    registerListProjectsCommand(registry);
  }
};

export * from "./types.ts";
export * from "./application/resolve-workspace.ts";
export * from "./application/discover-projects.ts";

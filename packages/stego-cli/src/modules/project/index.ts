import type { ModuleApi } from "../../app/index.ts";
import type { CommandRegistry } from "../../app/command-registry.ts";
import { registerNewProjectCommand } from "./commands/new-project.ts";

export const projectModule: ModuleApi = {
  registerCommands(registry: CommandRegistry): void {
    registerNewProjectCommand(registry);
  }
};

export * from "./types.ts";
export * from "./application/create-project.ts";
export * from "./application/infer-project.ts";

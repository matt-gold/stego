import type { ModuleApi } from "../../app/index.ts";
import type { CommandRegistry } from "../../app/command-registry.ts";
import { registerNewManuscriptCommand } from "./commands/new-manuscript.ts";

export const manuscriptModule: ModuleApi = {
  registerCommands(registry: CommandRegistry): void {
    registerNewManuscriptCommand(registry);
  }
};

export * from "./types.ts";
export * from "./application/create-manuscript.ts";
export * from "./application/order-inference.ts";

import type { ModuleApi } from "../../app/index.ts";
import type { CommandRegistry } from "../../app/command-registry.ts";
import { registerBuildCommand } from "./commands/build.ts";

export const compileModule: ModuleApi = {
  registerCommands(registry: CommandRegistry): void {
    registerBuildCommand(registry);
  }
};

export * from "./types.ts";
export * from "./application/compile-manuscript.ts";
export * from "./application/resolve-compile-plan.ts";

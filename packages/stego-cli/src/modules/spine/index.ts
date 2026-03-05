import type { ModuleApi } from "../../app/index.ts";
import type { CommandRegistry } from "../../app/command-registry.ts";
import { registerSpineReadCommand } from "./commands/spine-read.ts";
import { registerSpineNewCategoryCommand } from "./commands/spine-new-category.ts";
import { registerSpineNewEntryCommand } from "./commands/spine-new-entry.ts";
import { registerSpineDeprecatedAliases } from "./commands/spine-deprecated-aliases.ts";

export const spineModule: ModuleApi = {
  registerCommands(registry: CommandRegistry): void {
    registerSpineReadCommand(registry);
    registerSpineNewCategoryCommand(registry);
    registerSpineNewEntryCommand(registry);
    registerSpineDeprecatedAliases(registry);
  }
};

export * from "./types.ts";
export * from "./application/read-catalog.ts";
export * from "./application/create-category.ts";
export * from "./application/create-entry.ts";

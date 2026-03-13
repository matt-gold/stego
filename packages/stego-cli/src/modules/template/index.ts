import type { ModuleApi } from "../../app/index.ts";
import type { CommandRegistry } from "../../app/command-registry.ts";
import { registerTemplateBuildCommand } from "./commands/template-build.ts";
import { registerTemplateExportCommand } from "./commands/template-export.ts";

export const templateModule: ModuleApi = {
  registerCommands(registry: CommandRegistry): void {
    registerTemplateBuildCommand(registry);
    registerTemplateExportCommand(registry);
  }
};

export * from "./types.ts";
export * from "./application/build-template-project.ts";
export * from "./application/export-template-project.ts";

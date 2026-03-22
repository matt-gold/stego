import type { ModuleApi } from "../../app/index.ts";
import type { CommandRegistry } from "../../app/command-registry.ts";
import { registerExportCommand } from "./commands/export.ts";

export const exportModule: ModuleApi = {
  registerCommands(registry: CommandRegistry): void {
    registerExportCommand(registry);
  }
};

export * from "./types.ts";
export * from "./application/run-export.ts";
export * from "./application/prepare-rendered-export.ts";
export { createPandocExporter } from "./infra/pandoc-exporter.ts";

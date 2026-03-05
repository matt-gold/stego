import type { ModuleApi } from "../../app/index.ts";
import type { CommandRegistry } from "../../app/command-registry.ts";
import { registerMetadataReadCommand } from "./commands/metadata-read.ts";
import { registerMetadataApplyCommand } from "./commands/metadata-apply.ts";

export const metadataModule: ModuleApi = {
  registerCommands(registry: CommandRegistry): void {
    registerMetadataReadCommand(registry);
    registerMetadataApplyCommand(registry);
  }
};

export * from "./types.ts";
export * from "./application/read-metadata.ts";
export * from "./application/apply-metadata.ts";

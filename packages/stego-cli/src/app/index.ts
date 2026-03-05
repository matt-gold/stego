import type { CommandRegistry } from "./command-registry.ts";

export type ModuleApi = {
  registerCommands(registry: CommandRegistry): void;
};

export * from "./command-context.ts";
export * from "./command-registry.ts";
export * from "./cli-version.ts";
export * from "./create-cli-app.ts";
export * from "./error-boundary.ts";
export * from "./output-renderer.ts";

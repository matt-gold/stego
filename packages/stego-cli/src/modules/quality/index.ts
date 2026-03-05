import type { ModuleApi } from "../../app/index.ts";
import type { CommandRegistry } from "../../app/command-registry.ts";
import { registerValidateCommand } from "./commands/validate.ts";
import { registerLintCommand } from "./commands/lint.ts";
import { registerCheckStageCommand } from "./commands/check-stage.ts";

export const qualityModule: ModuleApi = {
  registerCommands(registry: CommandRegistry): void {
    registerValidateCommand(registry);
    registerLintCommand(registry);
    registerCheckStageCommand(registry);
  }
};

export * from "./types.ts";
export * from "./application/inspect-project.ts";
export * from "./application/stage-check.ts";
export * from "./application/lint-runner.ts";

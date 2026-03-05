import type { CommandRegistry } from "../../../app/command-registry.ts";

export function registerSpineDeprecatedAliases(registry: CommandRegistry): void {
  registry.register({
    name: "spine add-category",
    description: "Deprecated alias for spine new-category",
    allowUnknownOptions: true,
    options: [
      { flags: "--project <project-id>", description: "Project id" },
      { flags: "--key <category>", description: "Category key" },
      { flags: "--label <label>", description: "Category display label" },
      { flags: "--require-metadata", description: "Append key to required metadata" },
      { flags: "--format <format>", description: "text|json" },
      { flags: "--root <path>", description: "Workspace root path" }
    ],
    action: () => {
      throw new Error("`stego spine add-category` was renamed. Use `stego spine new-category`.");
    }
  });

  registry.register({
    name: "spine new-entry",
    description: "Deprecated alias for spine new",
    allowUnknownOptions: true,
    options: [
      { flags: "--project <project-id>", description: "Project id" },
      { flags: "--category <category>", description: "Category key" },
      { flags: "--filename <path>", description: "Relative entry path" },
      { flags: "--format <format>", description: "text|json" },
      { flags: "--root <path>", description: "Workspace root path" }
    ],
    action: () => {
      throw new Error("`stego spine new-entry` was renamed. Use `stego spine new`.");
    }
  });
}

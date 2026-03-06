import { cac, type CAC, type Command } from "cac";
import type { AppContext, CommandContext } from "./command-context.ts";

export type CommandOptionSpec = {
  flags: string;
  description?: string;
  defaultValue?: unknown;
};

export type CommandSpec = {
  name: string;
  description: string;
  options?: CommandOptionSpec[];
  allowUnknownOptions?: boolean;
  action: (context: CommandContext) => Promise<void> | void;
};

export class CommandRegistry {
  public readonly cli: CAC;
  public readonly appContext: AppContext;
  private readonly multiTokenCommandMappings: MultiTokenCommandMapping[] = [];
  private readonly helpEntries: CommandHelpEntry[] = [];

  public constructor(appContext: AppContext) {
    this.appContext = appContext;
    this.cli = cac("stego");
  }

  public showHelp(): void {
    const commandWidth = this.helpEntries.reduce(
      (max, entry) => Math.max(max, entry.usageName.length),
      0
    );

    const lines: string[] = [
      "stego",
      "",
      "Usage:",
      "  $ stego <command> [options]",
      "",
      "Commands:"
    ];

    for (const entry of this.helpEntries) {
      lines.push(`  ${entry.usageName.padEnd(commandWidth + 2)}${entry.description}`);
    }

    lines.push("");
    lines.push("For more info, run any command with the `--help` flag:");
    for (const entry of this.helpEntries) {
      lines.push(`  $ stego ${entry.commandTokens.join(" ")} --help`);
    }

    this.appContext.stdout.write(`${lines.join("\n")}\n`);
  }

  public tryShowCommandHelp(argv: string[]): boolean {
    if (!containsHelpFlag(argv)) {
      return false;
    }

    const candidate = argv.filter((token) => token !== "--help" && token !== "-h");
    const entry = this.findHelpEntry(candidate);
    if (!entry) {
      return false;
    }

    const optionRows = [...entry.options.map((option) => ({
      flags: option.flags,
      description: option.description ?? ""
    })), { flags: "-h, --help", description: "Display this message" }];
    const optionWidth = optionRows.reduce((max, row) => Math.max(max, row.flags.length), 0);

    const lines: string[] = [
      "stego",
      "",
      "Usage:",
      `  $ stego ${entry.usageName}`,
      "",
      "Options:"
    ];

    for (const row of optionRows) {
      lines.push(`  ${row.flags.padEnd(optionWidth + 2)}${row.description}`);
    }

    this.appContext.stdout.write(`${lines.join("\n")}\n`);
    return true;
  }

  public register(spec: CommandSpec): void {
    const commandName = normalizeRegisteredCommandName(spec.name, this.multiTokenCommandMappings);
    this.helpEntries.push(createCommandHelpEntry(spec.name, spec.description, spec.options ?? []));
    let command: Command = this.cli.command(commandName, spec.description);

    for (const option of spec.options ?? []) {
      const optionConfig = option.defaultValue === undefined
        ? undefined
        : { default: option.defaultValue };
      command = command.option(option.flags, option.description ?? "", optionConfig);
    }

    if (spec.allowUnknownOptions) {
      command = command.allowUnknownOptions();
    }

    command.action(async (...actionArgs: unknown[]) => {
      const optionsCandidate = actionArgs[actionArgs.length - 1];
      const options = isPlainObject(optionsCandidate)
        ? sanitizeOptions(optionsCandidate)
        : {};
      const positionals = actionArgs
        .slice(0, Math.max(0, actionArgs.length - 1))
        .map((value) => String(value));

      await spec.action({
        ...this.appContext,
        positionals,
        options
      });
    });
  }

  public run(argv: string[]): Promise<void> {
    this.cli.help();
    const normalizedArgv = normalizeDashInputValueArgv(
      normalizeIncomingArgv(argv, this.multiTokenCommandMappings)
    );
    this.cli.parse(["stego", "stego", ...normalizedArgv], { run: false });
    if (!this.cli.matchedCommand) {
      throw new Error("NO_MATCHED_COMMAND");
    }
    return this.cli.runMatchedCommand();
  }

  private findHelpEntry(argv: string[]): CommandHelpEntry | null {
    if (argv.length === 0) {
      return null;
    }

    const entries = [...this.helpEntries]
      .sort((a, b) => b.commandTokens.length - a.commandTokens.length);

    for (const entry of entries) {
      if (startsWithTokens(argv, entry.commandTokens)) {
        return entry;
      }
    }

    const colonCandidate = argv[0];
    if (typeof colonCandidate === "string") {
      for (const entry of entries) {
        if (entry.normalizedToken === colonCandidate) {
          return entry;
        }
      }
    }

    return null;
  }
}

type MultiTokenCommandMapping = {
  rawTokens: string[];
  normalizedToken: string;
};

type CommandHelpEntry = {
  usageName: string;
  description: string;
  commandTokens: string[];
  normalizedToken: string;
  options: CommandOptionSpec[];
};

function normalizeRegisteredCommandName(
  rawName: string,
  mappings: MultiTokenCommandMapping[]
): string {
  const tokens = rawName.trim().split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) {
    return rawName;
  }

  const commandTokens: string[] = [];
  for (const token of tokens) {
    if (token.startsWith("<") || token.startsWith("[")) {
      break;
    }
    commandTokens.push(token);
  }

  if (commandTokens.length <= 1) {
    return rawName;
  }

  const argumentTokens = tokens.slice(commandTokens.length);
  const normalizedToken = commandTokens.join(":");

  mappings.push({
    rawTokens: commandTokens,
    normalizedToken
  });

  return argumentTokens.length > 0
    ? `${normalizedToken} ${argumentTokens.join(" ")}`
    : normalizedToken;
}

function createCommandHelpEntry(
  rawName: string,
  description: string,
  options: CommandOptionSpec[]
): CommandHelpEntry {
  const tokens = rawName.trim().split(/\s+/).filter(Boolean);
  const commandTokens = extractCommandTokens(tokens);
  return {
    usageName: rawName,
    description,
    commandTokens,
    normalizedToken: commandTokens.join(":"),
    options
  };
}

function extractCommandTokens(tokens: string[]): string[] {
  const commandTokens: string[] = [];
  for (const token of tokens) {
    if (token.startsWith("<") || token.startsWith("[")) {
      break;
    }
    commandTokens.push(token);
  }
  return commandTokens;
}

function normalizeIncomingArgv(
  argv: string[],
  mappings: MultiTokenCommandMapping[]
): string[] {
  if (argv.length === 0 || mappings.length === 0) {
    return argv;
  }

  const sortedMappings = [...mappings]
    .sort((a, b) => b.rawTokens.length - a.rawTokens.length);

  for (const mapping of sortedMappings) {
    if (!startsWithTokens(argv, mapping.rawTokens)) {
      continue;
    }

    return [mapping.normalizedToken, ...argv.slice(mapping.rawTokens.length)];
  }

  return argv;
}

function normalizeDashInputValueArgv(argv: string[]): string[] {
  const normalized: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    if (current === "--input" && next === "-") {
      normalized.push("--input=-");
      index += 1;
      continue;
    }

    normalized.push(current);
  }

  return normalized;
}

function containsHelpFlag(argv: string[]): boolean {
  return argv.includes("--help") || argv.includes("-h");
}

function startsWithTokens(input: string[], expected: string[]): boolean {
  if (input.length < expected.length) {
    return false;
  }

  for (let index = 0; index < expected.length; index += 1) {
    if (input[index] !== expected[index]) {
      return false;
    }
  }

  return true;
}

function sanitizeOptions(options: Record<string, unknown>): Record<string, unknown> {
  const next = { ...options };
  delete next["--"];
  return next;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

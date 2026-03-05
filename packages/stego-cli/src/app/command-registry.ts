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

  public constructor(appContext: AppContext) {
    this.appContext = appContext;
    this.cli = cac("stego");
  }

  public showHelp(): void {
    this.cli.outputHelp();
  }

  public register(spec: CommandSpec): void {
    const commandName = normalizeRegisteredCommandName(spec.name, this.multiTokenCommandMappings);
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
}

type MultiTokenCommandMapping = {
  rawTokens: string[];
  normalizedToken: string;
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

function shouldRenderJsonError(argv: string[]): boolean {
  return argv.includes("--format") && argv.includes("json");
}

type CliLikeError = {
  code?: string;
  details?: Record<string, unknown>;
  exitCode?: number;
  message: string;
};

function errorEnvelope(
  code: string,
  message: string,
  details?: Record<string, unknown>
): { ok: false; version: number; code: string; message: string; details?: Record<string, unknown> } {
  return {
    ok: false,
    version: 1,
    code,
    message,
    details
  };
}

export async function runWithErrorBoundary(argv: string[], run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (isCliLikeError(error)) {
      if (shouldRenderJsonError(argv)) {
        writeJsonError(errorEnvelope(error.code || "INTERNAL_ERROR", error.message, error.details));
      } else {
        process.stderr.write(`ERROR: ${error.message}\n`);
      }
      process.exit(error.exitCode ?? 1);
    }

    const message = error instanceof Error ? error.message : String(error);
    if (shouldRenderJsonError(argv)) {
      writeJsonError(errorEnvelope("INTERNAL_ERROR", message));
    } else {
      process.stderr.write(`ERROR: ${message}\n`);
    }
    process.exit(1);
  }
}

function writeJsonError(payload: unknown): void {
  process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function isCliLikeError(value: unknown): value is CliLikeError {
  return typeof value === "object" && value !== null && "message" in value;
}

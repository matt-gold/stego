import type { CliErrorEnvelope } from "../../../../shared/src/contracts/cli";

type LegacyCliErrorEnvelope = {
  ok: false;
  message?: string;
};

export function tryParseJson<T>(text: string): T | undefined {
  const trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return undefined;
  }
}

export function extractCliErrorMessage(stdout: string, stderr: string): string | undefined {
  const stderrPayload = tryParseJson<CliErrorEnvelope | LegacyCliErrorEnvelope>(stderr);
  if (stderrPayload && stderrPayload.ok === false && typeof stderrPayload.message === 'string') {
    return stderrPayload.message;
  }

  const stdoutPayload = tryParseJson<CliErrorEnvelope | LegacyCliErrorEnvelope>(stdout);
  if (stdoutPayload && stdoutPayload.ok === false && typeof stdoutPayload.message === 'string') {
    return stdoutPayload.message;
  }

  return undefined;
}

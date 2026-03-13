import type { CliErrorEnvelope } from "@stego-labs/shared/contracts/cli";

type MinimalCliErrorEnvelope = {
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
  const stderrPayload = tryParseJson<CliErrorEnvelope | MinimalCliErrorEnvelope>(stderr);
  if (stderrPayload && stderrPayload.ok === false && typeof stderrPayload.message === 'string') {
    return stderrPayload.message;
  }

  const stdoutPayload = tryParseJson<CliErrorEnvelope | MinimalCliErrorEnvelope>(stdout);
  if (stdoutPayload && stdoutPayload.ok === false && typeof stdoutPayload.message === 'string') {
    return stdoutPayload.message;
  }

  return undefined;
}

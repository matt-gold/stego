import type { CliOperation } from "./operations.ts";
import type { CliErrorCode } from "./errors.ts";

export const CLI_CONTRACT_VERSION = 1;

export type CliSuccessEnvelope<TPayload> = {
  ok: true;
  version: number;
  operation: CliOperation;
  data: TPayload;
};

export type CliErrorEnvelope = {
  ok: false;
  version: number;
  operation?: CliOperation;
  code: CliErrorCode;
  message: string;
  details?: Record<string, unknown>;
};

export function successEnvelope<TPayload>(
  operation: CliOperation,
  data: TPayload
): CliSuccessEnvelope<TPayload> {
  return {
    ok: true,
    version: CLI_CONTRACT_VERSION,
    operation,
    data
  };
}

export function errorEnvelope(
  code: CliErrorCode,
  message: string,
  options?: { operation?: CliOperation; details?: Record<string, unknown> }
): CliErrorEnvelope {
  return {
    ok: false,
    version: CLI_CONTRACT_VERSION,
    operation: options?.operation,
    code,
    message,
    details: options?.details
  };
}

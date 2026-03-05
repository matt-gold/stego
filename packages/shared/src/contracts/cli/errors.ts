import { getExitCodeForError } from "./exit-codes.ts";

export type CliErrorCode =
  | "INVALID_USAGE"
  | "WORKSPACE_NOT_FOUND"
  | "PROJECT_NOT_FOUND"
  | "INVALID_CONFIGURATION"
  | "INVALID_PAYLOAD"
  | "VALIDATION_FAILED"
  | "COMMENT_APPENDIX_INVALID"
  | "WRITE_FAILURE"
  | "TOOLING_MISSING"
  | "INTERNAL_ERROR";

export class CliError extends Error {
  public readonly code: CliErrorCode;

  public readonly details?: Record<string, unknown>;

  public constructor(code: CliErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.details = details;
  }

  public get exitCode(): number {
    return getExitCodeForError(this.code);
  }
}

export type CommentsErrorCode =
  | "INVALID_USAGE"
  | "NOT_STEGO_MANUSCRIPT"
  | "INVALID_PAYLOAD"
  | "COMMENT_APPENDIX_INVALID"
  | "WRITE_FAILURE";

export type CommentsOutputFormat = "json" | "text";

/** Error raised for machine-facing comments command failures. */
export class CommentsCommandError extends Error {
  public readonly code: CommentsErrorCode;
  public readonly exitCode: number;
  public readonly outputFormat: CommentsOutputFormat;

  public constructor(
    code: CommentsErrorCode,
    exitCode: number,
    message: string,
    outputFormat: CommentsOutputFormat = "text"
  ) {
    super(message);
    this.name = "CommentsCommandError";
    this.code = code;
    this.exitCode = exitCode;
    this.outputFormat = outputFormat;
  }

  public toJson(): { ok: false; code: CommentsErrorCode; message: string } {
    return {
      ok: false,
      code: this.code,
      message: this.message
    };
  }
}

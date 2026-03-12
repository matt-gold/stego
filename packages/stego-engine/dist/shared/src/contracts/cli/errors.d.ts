export type CliErrorCode = "INVALID_USAGE" | "WORKSPACE_NOT_FOUND" | "PROJECT_NOT_FOUND" | "INVALID_CONFIGURATION" | "INVALID_PAYLOAD" | "VALIDATION_FAILED" | "COMMENT_APPENDIX_INVALID" | "WRITE_FAILURE" | "TOOLING_MISSING" | "INTERNAL_ERROR";
export declare class CliError extends Error {
    readonly code: CliErrorCode;
    readonly details?: Record<string, unknown>;
    constructor(code: CliErrorCode, message: string, details?: Record<string, unknown>);
    get exitCode(): number;
}
//# sourceMappingURL=errors.d.ts.map
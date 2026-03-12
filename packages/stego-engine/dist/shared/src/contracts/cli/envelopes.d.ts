import type { CliOperation } from "./operations.ts";
import type { CliErrorCode } from "./errors.ts";
export declare const CLI_CONTRACT_VERSION = 1;
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
export declare function successEnvelope<TPayload>(operation: CliOperation, data: TPayload): CliSuccessEnvelope<TPayload>;
export declare function errorEnvelope(code: CliErrorCode, message: string, options?: {
    operation?: CliOperation;
    details?: Record<string, unknown>;
}): CliErrorEnvelope;
//# sourceMappingURL=envelopes.d.ts.map
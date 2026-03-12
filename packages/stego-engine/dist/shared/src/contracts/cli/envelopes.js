export const CLI_CONTRACT_VERSION = 1;
export function successEnvelope(operation, data) {
    return {
        ok: true,
        version: CLI_CONTRACT_VERSION,
        operation,
        data
    };
}
export function errorEnvelope(code, message, options) {
    return {
        ok: false,
        version: CLI_CONTRACT_VERSION,
        operation: options?.operation,
        code,
        message,
        details: options?.details
    };
}
//# sourceMappingURL=envelopes.js.map
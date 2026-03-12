export function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
//# sourceMappingURL=guards.js.map
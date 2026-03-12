export function formatSpacingValue(value) {
    if (value == null) {
        return undefined;
    }
    return typeof value === "number" ? `${value}pt` : value;
}
//# sourceMappingURL=spacing.js.map
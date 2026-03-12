export function formatSizeValue(value) {
    if (value == null) {
        return undefined;
    }
    return typeof value === "number" ? `${value}pt` : value;
}
//# sourceMappingURL=images.js.map
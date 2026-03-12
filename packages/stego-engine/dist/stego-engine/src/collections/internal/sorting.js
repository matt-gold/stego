export function sortItems(items, selector) {
    const next = [...items];
    next.sort((a, b) => compareValues(resolveSortValue(a, selector), resolveSortValue(b, selector)));
    return next;
}
function resolveSortValue(item, selector) {
    if (typeof selector === "function") {
        return selector(item);
    }
    const raw = item[selector];
    if (typeof raw === "string" || typeof raw === "number") {
        return raw;
    }
    return undefined;
}
function compareValues(a, b) {
    if (a == null && b == null) {
        return 0;
    }
    if (a == null) {
        return 1;
    }
    if (b == null) {
        return -1;
    }
    if (typeof a === "number" && typeof b === "number") {
        return a - b;
    }
    return String(a).localeCompare(String(b));
}
//# sourceMappingURL=sorting.js.map
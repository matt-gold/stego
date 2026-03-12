export function groupItems(items, selector) {
    const grouped = new Map();
    for (const item of items) {
        const resolved = resolveGroupValue(item, selector);
        if (!resolved) {
            continue;
        }
        const bucket = grouped.get(resolved) ?? [];
        bucket.push(item);
        grouped.set(resolved, bucket);
    }
    return [...grouped.entries()].map(([value, groupedItems]) => ({
        key: value,
        value,
        items: groupedItems,
        first: groupedItems[0]
    }));
}
export function splitItems(items, selector) {
    const groups = [];
    let activeValue;
    for (const item of items) {
        const resolved = resolveGroupValue(item, selector);
        const currentValue = resolved ?? activeValue;
        const previous = groups[groups.length - 1];
        if (previous && previous.value === currentValue) {
            previous.items.push(item);
            if (resolved) {
                activeValue = resolved;
            }
            continue;
        }
        if (resolved) {
            activeValue = resolved;
        }
        groups.push({
            key: currentValue,
            value: currentValue,
            items: [item],
            first: item
        });
    }
    return groups;
}
export function resolveGroupValue(item, selector) {
    const raw = typeof selector === "function"
        ? selector(item)
        : resolveNamedValue(item, selector);
    if (raw == null) {
        return undefined;
    }
    const normalized = String(raw).trim();
    return normalized.length > 0 ? normalized : undefined;
}
function resolveNamedValue(item, key) {
    const ownValue = Reflect.get(item, key);
    if (typeof ownValue === "string" || typeof ownValue === "number") {
        return ownValue;
    }
    const metadata = Reflect.get(item, "metadata");
    if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
        const metadataValue = Reflect.get(metadata, key);
        if (typeof metadataValue === "string" || typeof metadataValue === "number") {
            return metadataValue;
        }
    }
    return undefined;
}
//# sourceMappingURL=grouping.js.map
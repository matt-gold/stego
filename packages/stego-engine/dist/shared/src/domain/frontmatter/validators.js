import * as yaml from "js-yaml";
export function isValidMetadataKey(value) {
    return /^[A-Za-z0-9_-]+$/.test(value);
}
export function parseMetadataInput(value) {
    if (!value.trim()) {
        return "";
    }
    const loaded = yaml.load(value);
    return loaded === undefined ? value : loaded;
}
export function formatMetadataValue(value) {
    if (typeof value === "string") {
        return value;
    }
    const dumped = yaml.dump(value, { lineWidth: -1, noRefs: true }).trim();
    return dumped || String(value);
}
export function normalizeFrontmatterRecord(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error("Input payload 'frontmatter' must be a JSON object.");
    }
    const result = {};
    for (const [key, value] of Object.entries(raw)) {
        const normalizedKey = key.trim();
        if (!normalizedKey) {
            throw new Error("Frontmatter keys cannot be empty.");
        }
        result[normalizedKey] = normalizeFrontmatterValue(value, normalizedKey);
    }
    return result;
}
function normalizeFrontmatterValue(value, key) {
    if (Array.isArray(value)) {
        return value.map((item) => normalizeFrontmatterValue(item, key));
    }
    if (isPlainObject(value)) {
        const result = {};
        for (const [entryKey, entryValue] of Object.entries(value)) {
            const normalizedKey = entryKey.trim();
            if (!normalizedKey) {
                throw new Error(`Metadata key '${key}' contains an empty nested key.`);
            }
            result[normalizedKey] = normalizeFrontmatterValue(entryValue, key);
        }
        return result;
    }
    return normalizeFrontmatterScalar(value, key);
}
function normalizeFrontmatterScalar(value, key) {
    if (value === null) {
        return null;
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return value;
    }
    throw new Error(`Metadata key '${key}' must be scalar, array, or object.`);
}
function isPlainObject(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
//# sourceMappingURL=validators.js.map
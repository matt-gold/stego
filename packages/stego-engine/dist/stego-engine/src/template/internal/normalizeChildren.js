import { createTextNode } from "../../ir/index.js";
export function normalizeChildren(input) {
    const nodes = [];
    appendChildren(nodes, input);
    return nodes;
}
function appendChildren(nodes, input) {
    if (input == null || typeof input === "boolean") {
        return;
    }
    if (Array.isArray(input)) {
        for (const entry of input) {
            appendChildren(nodes, entry);
        }
        return;
    }
    if (typeof input === "string" || typeof input === "number") {
        nodes.push(createTextNode(String(input)));
        return;
    }
    if (isStegoNode(input)) {
        nodes.push(input);
        return;
    }
    throw new Error(`Unsupported template child value: ${String(input)}`);
}
function isStegoNode(value) {
    return typeof value === "object"
        && value !== null
        && "kind" in value
        && typeof value.kind === "string";
}
//# sourceMappingURL=normalizeChildren.js.map
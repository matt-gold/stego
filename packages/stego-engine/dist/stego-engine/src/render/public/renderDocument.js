import { lowerToPandocRenderPlan } from "../internal/backends/pandoc/index.js";
export function renderDocument(input) {
    return lowerToPandocRenderPlan(input.document, input.projectRoot);
}
//# sourceMappingURL=renderDocument.js.map
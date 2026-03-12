import path from "node:path";
import { normalizePageLayout } from "../../normalize/index.js";
import { buildPandocMetadata } from "./metadata-writer.js";
import { writePandocMarkdown } from "./markdown-writer.js";
export function lowerToPandocRenderPlan(document, projectRoot) {
    const layout = normalizePageLayout(document);
    return {
        backend: "pandoc",
        inputFormat: "markdown-implicit_figures",
        markdown: writePandocMarkdown(document.children),
        metadata: buildPandocMetadata(layout),
        resourcePaths: [projectRoot, path.join(projectRoot, "assets")],
        requiredFilters: ["image-layout", "block-layout"]
    };
}
//# sourceMappingURL=lower-to-render-plan.js.map
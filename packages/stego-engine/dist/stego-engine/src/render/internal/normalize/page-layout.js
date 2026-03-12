import { formatSpacingValue } from "./spacing.js";
export function normalizePageLayout(document) {
    const pageTemplate = document.children.find((node) => node.kind === "pageTemplate");
    const geometry = [];
    const size = document.page?.size;
    const margin = formatSpacingValue(document.page?.margin);
    if (size) {
        geometry.push(...toGeometryForSize(size));
    }
    if (margin) {
        geometry.push(`margin=${margin}`);
    }
    return {
        geometry,
        header: pageTemplate?.header,
        footer: pageTemplate?.footer
    };
}
function toGeometryForSize(size) {
    if (size === "5x8") {
        return ["paperwidth=5in", "paperheight=8in"];
    }
    if (size === "6x9") {
        return ["paperwidth=6in", "paperheight=9in"];
    }
    return ["paper=a5paper"];
}
//# sourceMappingURL=page-layout.js.map
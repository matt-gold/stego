import { createDocumentNode, createFragmentNode, createHeadingNode, createImageNode, createMarkdownNode, createPageBreakNode, createPageNumberNode, createPageTemplateNode, createParagraphNode, createSectionNode } from "../../ir/index.js";
import { normalizeChildren } from "../internal/normalizeChildren.js";
export function Document(props) {
    return createDocumentNode(props.page, normalizeChildren(props.children));
}
export function Fragment(props) {
    return createFragmentNode(normalizeChildren(props.children));
}
export function Section(props) {
    return createSectionNode(props, normalizeChildren(props.children));
}
export function Heading(props) {
    return createHeadingNode(props.level, props, normalizeChildren(props.children));
}
export function Paragraph(props) {
    return createParagraphNode(props, normalizeChildren(props.children));
}
export function Markdown(props) {
    return createMarkdownNode(props.source);
}
export function Image(props) {
    return createImageNode(props);
}
export function PageBreak() {
    return createPageBreakNode();
}
export function PageTemplate(props) {
    return createPageTemplateNode(props.header, props.footer);
}
export function PageNumber() {
    return createPageNumberNode();
}
export const Stego = {
    Document,
    Fragment,
    Section,
    Heading,
    Paragraph,
    Markdown,
    Image,
    PageBreak,
    PageTemplate,
    PageNumber
};
//# sourceMappingURL=components.js.map
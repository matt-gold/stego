export function createParagraphNode(props, children) {
    return {
        kind: "paragraph",
        spaceBefore: props.spaceBefore,
        spaceAfter: props.spaceAfter,
        insetLeft: props.insetLeft,
        insetRight: props.insetRight,
        firstLineIndent: props.firstLineIndent,
        align: props.align,
        children
    };
}
//# sourceMappingURL=paragraph.js.map
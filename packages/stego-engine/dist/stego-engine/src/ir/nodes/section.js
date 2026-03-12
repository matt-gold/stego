export function createSectionNode(props, children) {
    return {
        kind: "section",
        role: props.role,
        id: props.id,
        spaceBefore: props.spaceBefore,
        spaceAfter: props.spaceAfter,
        insetLeft: props.insetLeft,
        insetRight: props.insetRight,
        firstLineIndent: props.firstLineIndent,
        align: props.align,
        children
    };
}
//# sourceMappingURL=section.js.map
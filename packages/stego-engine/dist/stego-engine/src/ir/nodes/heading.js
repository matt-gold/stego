export function createHeadingNode(level, props, children) {
    return {
        kind: "heading",
        level,
        spaceBefore: props.spaceBefore,
        spaceAfter: props.spaceAfter,
        insetLeft: props.insetLeft,
        insetRight: props.insetRight,
        align: props.align,
        children
    };
}
//# sourceMappingURL=heading.js.map
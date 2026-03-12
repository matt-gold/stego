export function getCommentThreadKey(comment) {
    const hasExplicitExcerptAnchor = comment.excerptStartLine !== undefined
        && comment.excerptStartCol !== undefined
        && comment.excerptEndLine !== undefined
        && comment.excerptEndCol !== undefined
        && (comment.excerptStartLine < comment.excerptEndLine
            || (comment.excerptStartLine === comment.excerptEndLine && comment.excerptStartCol < comment.excerptEndCol));
    if (hasExplicitExcerptAnchor) {
        return [
            "excerpt",
            String(comment.paragraphIndex ?? -1),
            String(comment.excerptStartLine),
            String(comment.excerptStartCol),
            String(comment.excerptEndLine),
            String(comment.excerptEndCol)
        ].join(":");
    }
    return comment.paragraphIndex !== undefined
        ? `paragraph:${comment.paragraphIndex}`
        : "file";
}
//# sourceMappingURL=thread-key.js.map
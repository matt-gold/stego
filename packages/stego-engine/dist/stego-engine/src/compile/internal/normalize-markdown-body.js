import path from "node:path";
export function normalizeMarkdownBody(body, markdownPath, projectRoot) {
    const chapterDir = path.dirname(markdownPath);
    return body.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (full, altText, destination) => {
        const trimmed = destination.trim();
        if (!trimmed || isExternalTarget(trimmed) || trimmed.startsWith("#")) {
            return full;
        }
        const resolved = path.resolve(chapterDir, trimmed);
        const relative = path.relative(projectRoot, resolved);
        if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
            return full;
        }
        return `![${altText}](${relative.split(path.sep).join("/")})`;
    });
}
function isExternalTarget(target) {
    return /^[a-z]+:\/\//i.test(target);
}
//# sourceMappingURL=normalize-markdown-body.js.map
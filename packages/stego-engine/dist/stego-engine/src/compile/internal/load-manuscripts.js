import fs from "node:fs";
import path from "node:path";
import { parseMarkdownDocument } from "../../../../shared/src/domain/frontmatter/index.js";
import { parseCommentAppendix } from "../../../../shared/src/domain/comments/index.js";
import { rewriteMarkdownImagesForChapter } from "../../../../shared/src/domain/images/index.js";
export function loadManuscripts(projectRoot, manuscriptDir, projectMeta) {
    if (!fs.existsSync(manuscriptDir)) {
        return [];
    }
    const files = fs.readdirSync(manuscriptDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
        .map((entry) => path.join(manuscriptDir, entry.name))
        .sort();
    return files.map((filePath) => loadManuscript(projectRoot, filePath, projectMeta))
        .sort((a, b) => compareOrders(a.order, b.order) || a.relativePath.localeCompare(b.relativePath));
}
function loadManuscript(projectRoot, filePath, projectMeta) {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = parseMarkdownDocument(raw);
    const withoutComments = parseCommentAppendix(parsed.body).contentWithoutComments;
    const relativePath = path.relative(projectRoot, filePath);
    const basename = path.basename(filePath, ".md");
    return {
        kind: "manuscript",
        path: filePath,
        relativePath,
        slug: toSlug(basename),
        titleFromFilename: toTitleFromFilename(basename),
        metadata: parsed.frontmatter,
        body: rewriteMarkdownImagesForChapter({
            body: withoutComments.trim(),
            chapterPath: filePath,
            projectRoot,
            projectMeta,
            frontmatter: parsed.frontmatter
        }),
        order: parseOrder(basename)
    };
}
function parseOrder(basename) {
    const match = basename.match(/^(\d+)[-_]/);
    return match ? Number(match[1]) : null;
}
function compareOrders(a, b) {
    if (a == null && b == null) {
        return 0;
    }
    if (a == null) {
        return 1;
    }
    if (b == null) {
        return -1;
    }
    return a - b;
}
function toSlug(value) {
    return value
        .replace(/^\d+[-_]?/, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}
function toTitleFromFilename(value) {
    const normalized = value.replace(/^\d+[-_]?/, "").replace(/[-_]+/g, " ").trim();
    if (!normalized) {
        return value;
    }
    return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
//# sourceMappingURL=load-manuscripts.js.map
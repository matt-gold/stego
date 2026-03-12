import { type ImageStyle } from "./style.ts";
export type ImageSettings = {
    global: ImageStyle;
    overrides: Map<string, ImageStyle>;
    warnings: string[];
};
export type RewriteMarkdownImagesInput = {
    body: string;
    chapterPath: string;
    projectRoot: string;
    projectMeta: Record<string, unknown>;
    frontmatter: Record<string, unknown>;
};
export declare function parseProjectImageDefaults(projectMeta: Record<string, unknown>): ImageSettings;
export declare function parseManuscriptImageOverrides(frontmatter: Record<string, unknown>): ImageSettings;
export declare function rewriteMarkdownImagesForChapter(input: RewriteMarkdownImagesInput): string;
//# sourceMappingURL=rewrite.d.ts.map
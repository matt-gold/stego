export type FrontmatterScalar = string | number | boolean | null;
export type FrontmatterValue = FrontmatterScalar | FrontmatterValue[] | {
    [key: string]: FrontmatterValue;
};
export type FrontmatterRecord = Record<string, FrontmatterValue>;
export interface ParsedMarkdownDocument {
    lineEnding: string;
    hasFrontmatter: boolean;
    frontmatter: FrontmatterRecord;
    body: string;
}
export declare function parseMarkdownDocument(raw: string): ParsedMarkdownDocument;
//# sourceMappingURL=parser.d.ts.map
import type { Collection } from "../../collections/index.ts";
import type { StegoDocumentNode, StegoNode } from "../../ir/index.ts";
export type ManuscriptRecord = {
    kind: "manuscript";
    path: string;
    relativePath: string;
    slug: string;
    titleFromFilename: string;
    metadata: Record<string, unknown>;
    body: string;
    order: number | null;
};
export type SpineEntryRecord = {
    kind: "spine-entry";
    path: string;
    relativePath: string;
    category: string;
    key: string;
    label: string;
    metadata: Record<string, unknown>;
    body: string;
};
export type SpineCategoryRecord = {
    kind: "spine-category";
    key: string;
    label: string;
    path: string;
    metadata: Record<string, unknown>;
};
export type TemplateContext = {
    project: {
        id: string;
        root: string;
        metadata: Record<string, unknown>;
    };
    collections: {
        manuscripts: Collection<ManuscriptRecord>;
        spineEntries: Collection<SpineEntryRecord>;
        spineCategories: Collection<SpineCategoryRecord>;
    };
};
export type StegoTemplate = {
    kind: "stego-template";
    render: (context: TemplateContext) => StegoDocumentNode | StegoNode;
};
//# sourceMappingURL=types.d.ts.map
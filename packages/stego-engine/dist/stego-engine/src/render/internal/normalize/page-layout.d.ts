import type { PageRegionSpec, StegoDocumentNode } from "../../../ir/index.ts";
export type NormalizedPageLayout = {
    geometry: string[];
    footer?: PageRegionSpec;
    header?: PageRegionSpec;
};
export declare function normalizePageLayout(document: StegoDocumentNode): NormalizedPageLayout;
//# sourceMappingURL=page-layout.d.ts.map
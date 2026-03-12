import type { SpineCategoryRecord, SpineEntryRecord } from "../../template/index.ts";
export type LoadedSpine = {
    entries: SpineEntryRecord[];
    categories: SpineCategoryRecord[];
};
export declare function loadSpine(projectRoot: string, spineDir: string): LoadedSpine;
//# sourceMappingURL=load-spine.d.ts.map
export type StageName = "draft" | "revise" | "line-edit" | "proof" | "final";
export declare const DEFAULT_ALLOWED_STATUSES: StageName[];
export declare function isStageName(value: string): value is StageName;
export declare function getStageRank(stage: StageName): number;
//# sourceMappingURL=index.d.ts.map
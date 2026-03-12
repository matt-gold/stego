export const DEFAULT_ALLOWED_STATUSES = [
    "draft",
    "revise",
    "line-edit",
    "proof",
    "final"
];
const STAGE_RANK = {
    draft: 0,
    revise: 1,
    "line-edit": 2,
    proof: 3,
    final: 4
};
export function isStageName(value) {
    return Object.hasOwn(STAGE_RANK, value);
}
export function getStageRank(stage) {
    return STAGE_RANK[stage];
}
//# sourceMappingURL=index.js.map
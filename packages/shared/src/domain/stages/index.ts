export type StageName = "draft" | "revise" | "line-edit" | "proof" | "final";

export const DEFAULT_ALLOWED_STATUSES: StageName[] = [
  "draft",
  "revise",
  "line-edit",
  "proof",
  "final"
];

const STAGE_RANK: Record<StageName, number> = {
  draft: 0,
  revise: 1,
  "line-edit": 2,
  proof: 3,
  final: 4
};

export function isStageName(value: string): value is StageName {
  return Object.hasOwn(STAGE_RANK, value);
}

export function getStageRank(stage: StageName): number {
  return STAGE_RANK[stage];
}

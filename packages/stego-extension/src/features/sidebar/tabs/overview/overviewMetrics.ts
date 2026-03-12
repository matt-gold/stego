import { getStageRank, isStageName } from '@stego/shared/domain/stages';

export function compareOverviewStatus(aStatus: string, bStatus: string): number {
  const rank = (status: string): number => {
    if (status === '(missing)') {
      return 5;
    }
    if (isStageName(status)) {
      return getStageRank(status);
    }
    return 100;
  };

  const aRank = rank(aStatus);
  const bRank = rank(bStatus);
  if (aRank !== bRank) {
    return aRank - bRank;
  }

  return aStatus.localeCompare(bStatus);
}

export function countOverviewWords(text: string): number {
  const normalized = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    .trim();
  if (!normalized) {
    return 0;
  }

  return normalized.split(/\s+/).filter((token) => token.length > 0).length;
}

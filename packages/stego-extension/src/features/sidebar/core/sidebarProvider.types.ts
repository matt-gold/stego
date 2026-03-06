import type { SidebarOverviewGateSnapshot, SidebarOverviewState } from '../../../shared/types';

export type RefreshMode = 'full' | 'fast';

export type OverviewBuildResult = {
  overview?: SidebarOverviewState;
  skippedFiles: number;
};

export type OverviewFileCacheEntry = {
  mtimeMs: number;
  frontmatter: Record<string, unknown>;
  wordCount: number;
  unresolvedCount: number;
  firstUnresolvedCommentId?: string;
  status: string;
};

export type OverviewFileCache = Map<string, OverviewFileCacheEntry>;

export type GateSnapshotByProject = Map<string, SidebarOverviewGateSnapshot>;

import * as path from 'path';
import { promises as fs } from 'fs';
import {
  applyLeafPolicyDefaults,
  isBranchFile,
  resolveLeafBranchId
} from '@stego-labs/shared/domain/content';
import { parseCommentAppendix, type SerializedCommentDocumentState } from '@stego-labs/shared/domain/comments';
import { parseMarkdownDocument as parseSharedMarkdownDocument } from '@stego-labs/shared/domain/frontmatter';
import type {
  ProjectScanContext,
  SidebarOverviewFirstMissingMetadata,
  SidebarOverviewFirstUnresolved,
  SidebarOverviewGateSnapshot,
  SidebarOverviewMapRow,
  SidebarOverviewStageCount,
  SidebarOverviewState
} from '../../../../../shared/types';
import { errorToMessage } from '../../../../../shared/errors';
import { buildProjectScanPlan } from '../../../../project/fileScan';
import { compareOverviewStatus, countOverviewWords } from '../../../tabs/overview';

type CommentReadResult = Promise<{ state?: SerializedCommentDocumentState; warning?: string }>;

export type OverviewSnapshotResult = {
  overview?: SidebarOverviewState;
  skippedFiles: number;
  loading: boolean;
};

type OverviewFileSummary = {
  filePath: string;
  mtimeMs: number;
  frontmatter: Record<string, unknown>;
  wordCount: number;
  unresolvedCount: number;
  firstUnresolvedCommentId?: string;
  status: string;
};

type OverviewAggregateCore = {
  manuscriptTitle: string;
  wordCount: number;
  manuscriptFileCount: number;
  missingRequiredMetadataCount: number;
  unresolvedCommentsCount: number;
  stageBreakdown: SidebarOverviewStageCount[];
  mapRows: SidebarOverviewMapRow[];
  firstUnresolvedComment?: SidebarOverviewFirstUnresolved;
  firstMissingMetadata?: SidebarOverviewFirstMissingMetadata;
  skippedFiles: number;
};

type OverviewProjectCacheState = {
  scanStamp?: string;
  aggregateCore?: OverviewAggregateCore;
  fileSummaries: Map<string, OverviewFileSummary>;
  knownFiles: Set<string>;
  inFlight?: Promise<void>;
  dirtyFiles: Set<string>;
  dirtyProject: boolean;
  projectTitleKey?: string;
  commentStamp?: string;
  commentVersion: number;
  version: number;
};

type OverviewSummaryCacheDeps = {
  now?: () => string;
  requestRefresh?: () => void;
  getGateSnapshot: (projectDir: string) => SidebarOverviewGateSnapshot;
  buildProjectScanPlan?: typeof buildProjectScanPlan;
  readCommentStateForFile: (filePath: string, options?: { showWarning?: boolean }) => CommentReadResult;
  logIssue?: (headline: string, options?: { projectFilePath?: string; filePath?: string; detail?: string }) => void;
};

function normalizeFilePath(filePath: string): string {
  return path.resolve(filePath);
}

function compareOverviewFiles(aPath: string, bPath: string): number {
  const aName = path.basename(aPath, path.extname(aPath));
  const bName = path.basename(bPath, path.extname(bPath));
  const aMatch = aName.match(/^(\d+)[-_]/);
  const bMatch = bName.match(/^(\d+)[-_]/);

  if (aMatch && bMatch) {
    const aOrder = Number(aMatch[1]);
    const bOrder = Number(bMatch[1]);
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }
  } else if (aMatch) {
    return -1;
  } else if (bMatch) {
    return 1;
  }

  return aPath.localeCompare(bPath);
}

function buildScanStamp(stampParts: string[]): string {
  return [...stampParts].sort((a, b) => a.localeCompare(b)).join('|');
}

function parseMtimeByPath(stampParts: string[]): Map<string, number> {
  const byPath = new Map<string, number>();
  for (const entry of stampParts) {
    const separator = entry.lastIndexOf(':');
    if (separator <= 0) {
      continue;
    }

    const filePath = entry.slice(0, separator);
    const rawValue = entry.slice(separator + 1);
    const mtimeMs = Number(rawValue);
    if (!Number.isFinite(mtimeMs)) {
      continue;
    }

    byPath.set(normalizeFilePath(filePath), mtimeMs);
  }

  return byPath;
}

function isMissingValue(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim().length === 0;
}

function resolveLeafBranch(projectContext: Pick<ProjectScanContext, 'projectDir' | 'branches'>, filePath: string) {
  const contentRoot = path.join(projectContext.projectDir, 'content');
  const branchId = resolveLeafBranchId(contentRoot, filePath);
  if (branchId === undefined) {
    return undefined;
  }
  return projectContext.branches.find((branch) => branch.id === branchId);
}

function buildEffectiveRequiredMetadata(
  projectContext: Pick<ProjectScanContext, 'projectDir' | 'branches'>,
  filePath: string
): string[] {
  const branch = resolveLeafBranch(projectContext, filePath);
  return [...(branch?.effectiveLeafPolicy.requiredMetadata ?? [])];
}

function createProjectCacheState(): OverviewProjectCacheState {
  return {
    fileSummaries: new Map(),
    knownFiles: new Set(),
    dirtyFiles: new Set(),
    dirtyProject: false,
    commentVersion: 0,
    version: 0
  };
}

/**
 * project scan -> file summary reuse/recompute -> aggregate core -> runtime overlay
 */
export class OverviewSummaryCache {
  private readonly projectStates = new Map<string, OverviewProjectCacheState>();
  private readonly pendingDirtyFiles = new Set<string>();
  private readonly pendingCommentDirtyFiles = new Set<string>();
  private readonly now: () => string;
  private readonly requestRefresh: () => void;
  private readonly buildProjectScanPlanImpl: typeof buildProjectScanPlan;
  private readonly readCommentStateForFileImpl: (filePath: string, options?: { showWarning?: boolean }) => CommentReadResult;
  private readonly logIssue: (headline: string, options?: { projectFilePath?: string; filePath?: string; detail?: string }) => void;

  constructor(private readonly deps: OverviewSummaryCacheDeps) {
    this.now = deps.now ?? (() => new Date().toISOString());
    this.requestRefresh = deps.requestRefresh ?? (() => {});
    this.buildProjectScanPlanImpl = deps.buildProjectScanPlan ?? buildProjectScanPlan;
    this.readCommentStateForFileImpl = deps.readCommentStateForFile;
    this.logIssue = deps.logIssue ?? (() => {});
  }

  public markFileDirty(filePath: string, options?: { commentsChanged?: boolean }): void {
    const normalized = normalizeFilePath(filePath);
    let matchedProject = false;

    for (const state of this.projectStates.values()) {
      if (!state.knownFiles.has(normalized)) {
        continue;
      }

      matchedProject = true;
      if (isBranchFile(normalized)) {
        state.dirtyProject = true;
      } else {
        state.dirtyFiles.add(normalized);
      }
      if (options?.commentsChanged && !isBranchFile(normalized)) {
        state.commentVersion += 1;
      }
      state.version += 1;
    }

    if (!matchedProject) {
      this.pendingDirtyFiles.add(normalized);
      if (options?.commentsChanged) {
        this.pendingCommentDirtyFiles.add(normalized);
      }
    }
  }

  public markProjectDirty(projectDir: string, options?: { commentsChanged?: boolean }): void {
    const state = this.getProjectState(projectDir);
    state.dirtyProject = true;
    if (options?.commentsChanged) {
      state.commentVersion += 1;
    }
    state.version += 1;
  }

  public clearProject(projectDir: string): void {
    this.projectStates.delete(path.resolve(projectDir));
  }

  public async getSnapshot(projectContext: ProjectScanContext): Promise<OverviewSnapshotResult> {
    const projectDir = path.resolve(projectContext.projectDir);
    const state = this.getProjectState(projectDir);
    const scanPlan = await this.buildProjectScanPlanImpl(projectDir);
    const scanFiles = scanPlan.files.map((filePath) => normalizeFilePath(filePath));
    const scanFileSet = new Set(scanFiles);
    this.consumePendingFileDirtiness(state, scanFileSet);

    const scanStamp = buildScanStamp(scanPlan.stampParts);
    const manuscriptTitle = projectContext.projectTitle?.trim() || path.basename(projectDir);
    const commentStamp = String(state.commentVersion);

    const aggregateIsCurrent = !!state.aggregateCore
      && !state.dirtyProject
      && state.dirtyFiles.size === 0
      && state.scanStamp === scanStamp
      && state.projectTitleKey === manuscriptTitle
      && state.commentStamp === commentStamp;

    if (aggregateIsCurrent) {
      const aggregateCore = state.aggregateCore;
      return {
        overview: this.materializeOverview(projectDir, aggregateCore!),
        skippedFiles: aggregateCore!.skippedFiles,
        loading: false
      };
    }

    if (!state.inFlight) {
      state.inFlight = this.rebuildProjectState(
        projectContext,
        state,
        scanFiles,
        scanPlan.stampParts,
        scanStamp,
        manuscriptTitle,
        commentStamp
      ).finally(() => {
        if (state.inFlight) {
          state.inFlight = undefined;
        }
        this.requestRefresh();
      });
    }

    if (state.aggregateCore) {
      return {
        overview: this.materializeOverview(projectDir, state.aggregateCore),
        skippedFiles: state.aggregateCore.skippedFiles,
        loading: true
      };
    }

    return {
      overview: undefined,
      skippedFiles: 0,
      loading: true
    };
  }

  private getProjectState(projectDir: string): OverviewProjectCacheState {
    const normalized = path.resolve(projectDir);
    let state = this.projectStates.get(normalized);
    if (!state) {
      state = createProjectCacheState();
      this.projectStates.set(normalized, state);
    }
    return state;
  }

  private consumePendingFileDirtiness(state: OverviewProjectCacheState, scanFiles: Set<string>): void {
    for (const filePath of [...this.pendingDirtyFiles]) {
      if (!scanFiles.has(filePath)) {
        continue;
      }
      this.pendingDirtyFiles.delete(filePath);
      if (isBranchFile(filePath)) {
        state.dirtyProject = true;
      } else {
        state.dirtyFiles.add(filePath);
      }
      state.version += 1;
    }

    for (const filePath of [...this.pendingCommentDirtyFiles]) {
      if (!scanFiles.has(filePath) || isBranchFile(filePath)) {
        continue;
      }
      this.pendingCommentDirtyFiles.delete(filePath);
      state.dirtyFiles.add(filePath);
      state.commentVersion += 1;
      state.version += 1;
    }
  }

  private async rebuildProjectState(
    projectContext: ProjectScanContext,
    state: OverviewProjectCacheState,
    scanFiles: string[],
    stampParts: string[],
    scanStamp: string,
    manuscriptTitle: string,
    commentStamp: string
  ): Promise<void> {
    const versionAtStart = state.version;
    const mtimeByPath = parseMtimeByPath(stampParts);
    const leafFiles = scanFiles
      .filter((filePath) => !isBranchFile(filePath))
      .sort(compareOverviewFiles);
    const leafFileSet = new Set(leafFiles);
    const nextSummaries = new Map(state.fileSummaries);

    for (const cachedPath of [...nextSummaries.keys()]) {
      if (!leafFileSet.has(cachedPath)) {
        nextSummaries.delete(cachedPath);
      }
    }

    for (const filePath of leafFiles) {
      const cached = nextSummaries.get(filePath);
      const mtimeMs = mtimeByPath.get(filePath);
      const shouldRecompute = state.dirtyProject
        || state.dirtyFiles.has(filePath)
        || !cached
        || mtimeMs === undefined
        || cached.mtimeMs !== mtimeMs;

      if (!shouldRecompute) {
        continue;
      }

      const nextSummary = await this.buildFileSummary(projectContext, filePath, mtimeMs);
      if (nextSummary) {
        nextSummaries.set(filePath, nextSummary);
      } else {
        nextSummaries.delete(filePath);
      }
    }

    const aggregateCore = this.buildAggregateCore(projectContext, manuscriptTitle, leafFiles, nextSummaries);

    if (state.version !== versionAtStart) {
      return;
    }

    state.fileSummaries = nextSummaries;
    state.knownFiles = new Set(scanFiles);
    state.aggregateCore = aggregateCore;
    state.scanStamp = scanStamp;
    state.projectTitleKey = manuscriptTitle;
    state.commentStamp = commentStamp;
    state.dirtyProject = false;
    state.dirtyFiles.clear();
  }

  private async buildFileSummary(
    projectContext: Pick<ProjectScanContext, 'projectDir' | 'branches'>,
    filePath: string,
    mtimeMs: number | undefined
  ): Promise<OverviewFileSummary | undefined> {
    if (!Number.isFinite(mtimeMs)) {
      this.logIssue('Skipped leaf file (stat failed).', {
        projectFilePath: path.join(projectContext.projectDir, 'stego-project.json'),
        filePath,
        detail: 'Missing file timestamp in scan plan.'
      });
      return undefined;
    }

    let text = '';
    try {
      text = await fs.readFile(filePath, 'utf8');
    } catch (error) {
      this.logIssue('Skipped leaf file (read failed).', {
        projectFilePath: path.join(projectContext.projectDir, 'stego-project.json'),
        filePath,
        detail: errorToMessage(error)
      });
      return undefined;
    }

    try {
      const commentState = await this.readCommentStateForFileImpl(filePath, { showWarning: false });
      const contentWithoutComments = commentState.state
        ? commentState.state.contentWithoutComments
        : parseCommentAppendix(text).contentWithoutComments;
      const parsed = parseSharedMarkdownDocument(contentWithoutComments);
      const branch = resolveLeafBranch(projectContext, filePath);
      const effectiveFrontmatter = branch
        ? applyLeafPolicyDefaults(parsed.frontmatter, branch.effectiveLeafPolicy)
        : parsed.frontmatter;
      const unresolvedCount = commentState.state?.unresolvedCount ?? 0;
      const firstUnresolvedCommentId = commentState.state?.comments.find((comment) => comment.status === 'open')?.id;
      const statusRaw = effectiveFrontmatter.status;
      const status = isMissingValue(statusRaw)
        ? '(missing)'
        : String(statusRaw).trim().toLowerCase();

      return {
        filePath,
        mtimeMs: mtimeMs!,
        frontmatter: effectiveFrontmatter,
        wordCount: countOverviewWords(parsed.body),
        unresolvedCount,
        firstUnresolvedCommentId,
        status
      };
    } catch (error) {
      this.logIssue('Skipped leaf file (parse failed).', {
        projectFilePath: path.join(projectContext.projectDir, 'stego-project.json'),
        filePath,
        detail: errorToMessage(error)
      });
      return undefined;
    }
  }

  private buildAggregateCore(
    projectContext: ProjectScanContext,
    manuscriptTitle: string,
    leafFiles: string[],
    summaries: Map<string, OverviewFileSummary>
  ): OverviewAggregateCore {
    let wordCount = 0;
    let missingRequiredMetadataCount = 0;
    let unresolvedCommentsCount = 0;
    let skippedFiles = 0;
    const stageCounts = new Map<string, number>();
    const mapRows: SidebarOverviewMapRow[] = [];
    let firstUnresolvedComment: SidebarOverviewFirstUnresolved | undefined;
    let firstMissingMetadata: SidebarOverviewFirstMissingMetadata | undefined;

    for (const filePath of leafFiles) {
      const summary = summaries.get(filePath);
      if (!summary) {
        skippedFiles += 1;
        continue;
      }

      wordCount += summary.wordCount;
      unresolvedCommentsCount += summary.unresolvedCount;

      let fileMissingMetadata = false;
      const requiredMetadata = buildEffectiveRequiredMetadata(projectContext, filePath);
      for (const key of requiredMetadata) {
        if (isMissingValue(summary.frontmatter[key])) {
          missingRequiredMetadataCount += 1;
          fileMissingMetadata = true;
        }
      }

      if (!firstMissingMetadata && fileMissingMetadata) {
        firstMissingMetadata = {
          filePath,
          fileLabel: path.basename(filePath)
        };
      }

      stageCounts.set(summary.status, (stageCounts.get(summary.status) ?? 0) + 1);

      if (summary.status !== '(missing)') {
        mapRows.push({
          kind: 'file',
          filePath,
          fileLabel: path.basename(filePath),
          status: summary.status
        });
      }

      if (!firstUnresolvedComment && summary.firstUnresolvedCommentId) {
        firstUnresolvedComment = {
          filePath,
          fileLabel: path.basename(filePath),
          commentId: summary.firstUnresolvedCommentId
        };
      }
    }

    const stageBreakdown = [...stageCounts.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => compareOverviewStatus(a.status, b.status));

    return {
      manuscriptTitle,
      wordCount,
      manuscriptFileCount: leafFiles.length,
      missingRequiredMetadataCount,
      unresolvedCommentsCount,
      stageBreakdown,
      mapRows,
      firstUnresolvedComment,
      firstMissingMetadata,
      skippedFiles
    };
  }

  private materializeOverview(projectDir: string, aggregateCore: OverviewAggregateCore): SidebarOverviewState {
    return {
      manuscriptTitle: aggregateCore.manuscriptTitle,
      generatedAt: this.now(),
      wordCount: aggregateCore.wordCount,
      manuscriptFileCount: aggregateCore.manuscriptFileCount,
      missingRequiredMetadataCount: aggregateCore.missingRequiredMetadataCount,
      unresolvedCommentsCount: aggregateCore.unresolvedCommentsCount,
      gateSnapshot: this.deps.getGateSnapshot(projectDir),
      stageBreakdown: aggregateCore.stageBreakdown,
      mapRows: aggregateCore.mapRows,
      firstUnresolvedComment: aggregateCore.firstUnresolvedComment,
      firstMissingMetadata: aggregateCore.firstMissingMetadata
    };
  }
}

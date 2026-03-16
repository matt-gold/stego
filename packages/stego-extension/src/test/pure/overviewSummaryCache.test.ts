import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { SerializedCommentDocumentState } from '@stego-labs/shared/domain/comments';
import { OverviewSummaryCache } from '../../features/sidebar/core/runtime/overview/overviewSummaryCache';
import type { ProjectScanContext, SidebarOverviewGateSnapshot } from '../../shared/types';

function createTempProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'stego-extension-overview-cache-'));
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function createProjectContext(
  projectDir: string,
  overrides: Partial<ProjectScanContext> = {}
): ProjectScanContext {
  return {
    projectDir,
    projectMtimeMs: Date.now(),
    projectTitle: 'Test Project',
    requiredMetadata: [],
    imageDefaults: {},
    branches: [],
    templates: [],
    issues: [],
    ...overrides
  };
}

function createRefreshTracker(): { callback: () => void; waitForNext: () => Promise<void>; count: () => number } {
  const waiters: Array<() => void> = [];
  let refreshCount = 0;

  return {
    callback: () => {
      refreshCount += 1;
      const next = waiters.shift();
      next?.();
    },
    waitForNext: () => new Promise<void>((resolve) => {
      waiters.push(resolve);
    }),
    count: () => refreshCount
  };
}

type CommentFixture = {
  unresolvedCount: number;
  comments: Array<{ id: string; status: 'open' | 'resolved' }>;
};

function createCommentReader() {
  const commentData = new Map<string, CommentFixture>();
  const readCounts = new Map<string, number>();
  const blockers = new Map<string, Promise<void>>();

  return {
    commentData,
    readCounts,
    block(filePath: string, promise: Promise<void>): void {
      blockers.set(path.resolve(filePath), promise);
    },
    read: async (filePath: string): Promise<{ state: SerializedCommentDocumentState }> => {
      const normalized = path.resolve(filePath);
      readCounts.set(normalized, (readCounts.get(normalized) ?? 0) + 1);
      const blocker = blockers.get(normalized);
      if (blocker) {
        await blocker;
        blockers.delete(normalized);
      }
      const fixture = commentData.get(normalized) ?? { unresolvedCount: 0, comments: [] };
      return {
        state: {
          contentWithoutComments: fs.readFileSync(normalized, 'utf8'),
          unresolvedCount: fixture.unresolvedCount,
          comments: fixture.comments as SerializedCommentDocumentState['comments'],
          parseErrors: [],
          anchorsById: {},
          totalCount: fixture.comments.length
        }
      };
    }
  };
}

async function loadReadySnapshot(
  cache: OverviewSummaryCache,
  context: ProjectScanContext
) {
  const initial = await cache.getSnapshot(context);
  if (!initial.loading) {
    return initial;
  }
  return waitForReadySnapshot(cache, context);
}

async function waitForReadySnapshot(
  cache: OverviewSummaryCache,
  context: ProjectScanContext,
  attempts = 50
) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const snapshot = await cache.getSnapshot(context);
    if (!snapshot.loading) {
      return snapshot;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  throw new Error('Overview snapshot did not become ready in time.');
}

test('overview cache handles invalidation and reuse scenarios', async () => {
  const projectDir = createTempProject();
  const refreshTracker = createRefreshTracker();
  const commentReader = createCommentReader();
  const gateSnapshot: SidebarOverviewGateSnapshot = {
    stageCheck: { state: 'never' },
    build: { state: 'never' }
  };

  const chapterA = path.join(projectDir, 'content', '100-opening.md');
  const chapterB = path.join(projectDir, 'content', '200-middle.md');
  const branchNotes = path.join(projectDir, 'content', 'reference', '_branch.md');
  writeFile(chapterA, '---\nstatus: draft\ncategory: opening\n---\nOne two three.\n');
  writeFile(chapterB, '---\ncategory: middle\n---\nFour five.\n');
  writeFile(branchNotes, '---\nlabel: Reference\n---\nReference notes.\n');

  const cache = new OverviewSummaryCache({
    getGateSnapshot: () => gateSnapshot,
    requestRefresh: refreshTracker.callback,
    readCommentStateForFile: commentReader.read,
    now: () => '2026-03-01T06:31:35.598Z'
  });

  // Scenario table:
  // 1. cold load
  // 2. warm reuse
  // 3. single dirty leaf
  // 4. added leaf via scan drift
  // 5. deleted leaf via scan drift
  // 6. requiredMetadata change
  // 7. project title change
  // 8. comment dependency change
  // 9. branch file change does not inflate leaf count
  const baseContext = createProjectContext(projectDir, {
    requiredMetadata: ['category']
  });

  const cold = await loadReadySnapshot(cache, baseContext);
  assert.equal(cold.loading, false);
  assert.equal(cold.overview?.manuscriptFileCount, 2);
  assert.equal(cold.overview?.wordCount, 5);
  assert.equal(cold.overview?.missingRequiredMetadataCount, 0);
  assert.equal(cold.overview?.mapRows.length, 1);
  assert.equal(cold.overview?.mapRows[0]?.filePath, chapterA);
  assert.equal(refreshTracker.count(), 1);

  const warm = await cache.getSnapshot(baseContext);
  assert.equal(warm.loading, false);
  assert.equal(refreshTracker.count(), 1);

  writeFile(chapterA, '---\nstatus: draft\ncategory: opening\n---\nOne two three four.\n');
  cache.markFileDirty(chapterA);
  const singleDirtyStale = await cache.getSnapshot(baseContext);
  assert.equal(singleDirtyStale.loading, true);
  await refreshTracker.waitForNext();
  const singleDirtyReady = await cache.getSnapshot(baseContext);
  assert.equal(singleDirtyReady.loading, false);
  assert.equal(singleDirtyReady.overview?.wordCount, 6);
  assert.equal(commentReader.readCounts.get(path.resolve(chapterA)), 2);
  assert.equal(commentReader.readCounts.get(path.resolve(chapterB)), 1);

  const chapterC = path.join(projectDir, 'content', '300-ending.md');
  writeFile(chapterC, '---\nstatus: review\ncategory: ending\n---\nSix seven.\n');
  const addedStale = await cache.getSnapshot(baseContext);
  assert.equal(addedStale.loading, true);
  const addedReady = await waitForReadySnapshot(cache, baseContext);
  assert.equal(addedReady.loading, false);
  assert.equal(addedReady.overview?.manuscriptFileCount, 3);
  assert.equal(addedReady.overview?.mapRows.length, 2);

  fs.rmSync(chapterC, { force: true });
  const deletedStale = await cache.getSnapshot(baseContext);
  assert.equal(deletedStale.loading, true);
  const deletedReady = await waitForReadySnapshot(cache, baseContext);
  assert.equal(deletedReady.loading, false);
  assert.equal(deletedReady.overview?.manuscriptFileCount, 2);

  const requiredMetadataContext = createProjectContext(projectDir, {
    requiredMetadata: ['category', 'concepts']
  });
  const metadataStale = await cache.getSnapshot(requiredMetadataContext);
  assert.equal(metadataStale.loading, true);
  const metadataReady = await waitForReadySnapshot(cache, requiredMetadataContext);
  assert.equal(metadataReady.loading, false);
  assert.equal(metadataReady.overview?.missingRequiredMetadataCount, 2);
  assert.equal(metadataReady.overview?.firstMissingMetadata?.filePath, chapterA);

  const renamedTitleContext = createProjectContext(projectDir, {
    projectTitle: 'Renamed Project',
    requiredMetadata: ['category', 'concepts']
  });
  const titleStale = await cache.getSnapshot(renamedTitleContext);
  assert.equal(titleStale.loading, true);
  const titleReady = await waitForReadySnapshot(cache, renamedTitleContext);
  assert.equal(titleReady.loading, false);
  assert.equal(titleReady.overview?.manuscriptTitle, 'Renamed Project');

  commentReader.commentData.set(path.resolve(chapterA), {
    unresolvedCount: 2,
    comments: [
      { id: 'CMT-001', status: 'open' },
      { id: 'CMT-002', status: 'open' }
    ]
  });
  cache.markFileDirty(chapterA, { commentsChanged: true });
  const commentsStale = await cache.getSnapshot(renamedTitleContext);
  assert.equal(commentsStale.loading, true);
  const commentsReady = await waitForReadySnapshot(cache, renamedTitleContext);
  assert.equal(commentsReady.loading, false);
  assert.equal(commentsReady.overview?.unresolvedCommentsCount, 2);
  assert.equal(commentsReady.overview?.firstUnresolvedComment?.commentId, 'CMT-001');

  writeFile(branchNotes, '---\nlabel: Reference\n---\nChanged branch notes.\n');
  const branchStale = await cache.getSnapshot(renamedTitleContext);
  assert.equal(branchStale.loading, true);
  const branchReady = await waitForReadySnapshot(cache, renamedTitleContext);
  assert.equal(branchReady.loading, false);
  assert.equal(branchReady.overview?.manuscriptFileCount, 2);
  assert.equal(branchReady.overview?.mapRows.length, 1);

  fs.rmSync(projectDir, { recursive: true, force: true });
});

test('overview cache drops stale in-flight recompute results and serves the latest invalidation', async () => {
  const projectDir = createTempProject();
  const refreshTracker = createRefreshTracker();
  const commentReader = createCommentReader();
  const chapter = path.join(projectDir, 'content', '100-opening.md');
  writeFile(chapter, '---\nstatus: draft\n---\nOne two.\n');

  const gateSnapshot: SidebarOverviewGateSnapshot = {
    stageCheck: { state: 'never' },
    build: { state: 'never' }
  };
  const cache = new OverviewSummaryCache({
    getGateSnapshot: () => gateSnapshot,
    requestRefresh: refreshTracker.callback,
    readCommentStateForFile: commentReader.read,
    now: () => '2026-03-01T06:31:35.598Z'
  });
  const context = createProjectContext(projectDir);

  const initial = await loadReadySnapshot(cache, context);
  assert.equal(initial.overview?.wordCount, 2);

  let releaseFirstLoad!: () => void;
  const firstLoadBlocked = new Promise<void>((resolve) => {
    releaseFirstLoad = resolve;
  });
  commentReader.block(chapter, firstLoadBlocked);

  writeFile(chapter, '---\nstatus: draft\n---\nOne two three four.\n');
  cache.markFileDirty(chapter);
  const staleWhileFirstLoadRuns = await cache.getSnapshot(context);
  assert.equal(staleWhileFirstLoadRuns.loading, true);
  assert.equal(staleWhileFirstLoadRuns.overview?.wordCount, 2);

  writeFile(chapter, '---\nstatus: draft\n---\nOne two three four five six.\n');
  cache.markFileDirty(chapter);
  releaseFirstLoad();

  await new Promise((resolve) => setTimeout(resolve, 0));
  const afterDiscard = await cache.getSnapshot(context);
  assert.equal(afterDiscard.loading, true);
  assert.equal(afterDiscard.overview?.wordCount, 2);

  const latest = await waitForReadySnapshot(cache, context);
  assert.equal(latest.loading, false);
  assert.equal(latest.overview?.wordCount, 6);

  fs.rmSync(projectDir, { recursive: true, force: true });
});

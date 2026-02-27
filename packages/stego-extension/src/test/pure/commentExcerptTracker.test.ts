import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CommentExcerptTracker,
  applyChangeToEntry,
  type ContentChange,
  type Pos,
  type TrackedComment
} from '../../features/comments/commentExcerptTracker';
import type { StegoCommentThread } from '../../features/comments/commentTypes';

function makeEntry(startLine: number, startChar: number, endLine: number, endChar: number): TrackedComment {
  const start: Pos = { line: startLine, character: startChar };
  const end: Pos = { line: endLine, character: endChar };
  return {
    id: 'CMT-0001',
    start: { ...start },
    end: { ...end },
    originalStart: { ...start },
    originalEnd: { ...end },
    deleted: false,
    dirty: false
  };
}

function change(startLine: number, startChar: number, endLine: number, endChar: number, text: string): ContentChange {
  return {
    range: {
      start: { line: startLine, character: startChar },
      end: { line: endLine, character: endChar }
    },
    text
  };
}

test('change entirely before excerpt shifts both endpoints', () => {
  // Excerpt on line 5, cols 0-10
  const entry = makeEntry(5, 0, 5, 10);
  // Insert a new line at line 2
  applyChangeToEntry(entry, change(2, 0, 2, 0, 'new line\n'));
  assert.deepStrictEqual(entry.start, { line: 6, character: 0 });
  assert.deepStrictEqual(entry.end, { line: 6, character: 10 });
  assert.equal(entry.dirty, true);
  assert.equal(entry.deleted, false);
});

test('change entirely after excerpt has no effect', () => {
  const entry = makeEntry(5, 0, 5, 10);
  applyChangeToEntry(entry, change(6, 0, 6, 5, 'replaced'));
  assert.deepStrictEqual(entry.start, { line: 5, character: 0 });
  assert.deepStrictEqual(entry.end, { line: 5, character: 10 });
  assert.equal(entry.dirty, false);
});

test('change entirely inside excerpt expands it (single line insert)', () => {
  // Excerpt on line 3, cols 0-20
  const entry = makeEntry(3, 0, 3, 20);
  // Insert 5 chars at col 10 on line 3
  applyChangeToEntry(entry, change(3, 10, 3, 10, 'XXXXX'));
  assert.deepStrictEqual(entry.start, { line: 3, character: 0 });
  assert.deepStrictEqual(entry.end, { line: 3, character: 25 });
  assert.equal(entry.dirty, true);
});

test('change entirely inside excerpt contracts it (single line delete)', () => {
  const entry = makeEntry(3, 0, 3, 20);
  // Delete 5 chars from col 10-15
  applyChangeToEntry(entry, change(3, 10, 3, 15, ''));
  assert.deepStrictEqual(entry.start, { line: 3, character: 0 });
  assert.deepStrictEqual(entry.end, { line: 3, character: 15 });
  assert.equal(entry.dirty, true);
});

test('change completely containing excerpt with empty replacement marks deleted', () => {
  const entry = makeEntry(3, 5, 3, 15);
  applyChangeToEntry(entry, change(3, 0, 3, 20, ''));
  assert.equal(entry.deleted, true);
  assert.equal(entry.dirty, true);
});

test('change completely containing excerpt with whitespace-only replacement marks deleted', () => {
  const entry = makeEntry(3, 5, 3, 15);
  applyChangeToEntry(entry, change(3, 0, 3, 20, '   '));
  assert.equal(entry.deleted, true);
});

test('change completely containing excerpt with non-empty replacement collapses to insertion', () => {
  const entry = makeEntry(3, 5, 3, 15);
  applyChangeToEntry(entry, change(3, 0, 3, 20, 'replacement'));
  assert.deepStrictEqual(entry.start, { line: 3, character: 0 });
  assert.deepStrictEqual(entry.end, { line: 3, character: 11 }); // 'replacement'.length
  assert.equal(entry.deleted, false);
  assert.equal(entry.dirty, true);
});

test('change overlapping start of excerpt adjusts start', () => {
  // Excerpt cols 10-20 on line 3
  const entry = makeEntry(3, 10, 3, 20);
  // Replace cols 5-12 with 'XX'
  applyChangeToEntry(entry, change(3, 5, 3, 12, 'XX'));
  // Start should be at insert end: col 7 (5 + 2)
  // End should shift: was 20, change end was 12, insert end is 7, so 20 + (7-12) = 15
  assert.deepStrictEqual(entry.start, { line: 3, character: 7 });
  assert.deepStrictEqual(entry.end, { line: 3, character: 15 });
  assert.equal(entry.dirty, true);
});

test('change overlapping end of excerpt adjusts end', () => {
  const entry = makeEntry(3, 10, 3, 20);
  // Replace cols 15-25 with 'YY'
  applyChangeToEntry(entry, change(3, 15, 3, 25, 'YY'));
  assert.deepStrictEqual(entry.start, { line: 3, character: 10 });
  // End should be at insert end: col 17 (15 + 2)
  assert.deepStrictEqual(entry.end, { line: 3, character: 17 });
  assert.equal(entry.dirty, true);
});

test('multi-line insert before excerpt shifts lines', () => {
  const entry = makeEntry(5, 3, 5, 10);
  // Insert two new lines at start of line 3
  applyChangeToEntry(entry, change(3, 0, 3, 0, 'line1\nline2\n'));
  assert.deepStrictEqual(entry.start, { line: 7, character: 3 });
  assert.deepStrictEqual(entry.end, { line: 7, character: 10 });
});

test('multi-line delete before excerpt shifts lines back', () => {
  const entry = makeEntry(5, 3, 5, 10);
  // Delete lines 2-3 (replace line 2 col 0 to line 4 col 0 with nothing)
  applyChangeToEntry(entry, change(2, 0, 4, 0, ''));
  assert.deepStrictEqual(entry.start, { line: 3, character: 3 });
  assert.deepStrictEqual(entry.end, { line: 3, character: 10 });
});

test('multi-line insert inside excerpt expands across lines', () => {
  // Excerpt line 3 col 0 to line 3 col 20
  const entry = makeEntry(3, 0, 3, 20);
  // Insert newline at col 10
  applyChangeToEntry(entry, change(3, 10, 3, 10, '\nnew line content'));
  assert.deepStrictEqual(entry.start, { line: 3, character: 0 });
  // End: was (3, 20), change end (3, 10), insert end (4, 16)
  // shiftPosition: line 3 + (4-3) = 4, char 20 + (16 - 10) = 26
  assert.deepStrictEqual(entry.end, { line: 4, character: 26 });
});

test('multi-line excerpt range tracks correctly', () => {
  // Excerpt spanning lines 3-5
  const entry = makeEntry(3, 5, 5, 10);
  // Insert a line before (at line 1)
  applyChangeToEntry(entry, change(1, 0, 1, 0, 'new\n'));
  assert.deepStrictEqual(entry.start, { line: 4, character: 5 });
  assert.deepStrictEqual(entry.end, { line: 6, character: 10 });
});

test('CommentExcerptTracker.load populates from comments with excerpt coords', () => {
  const tracker = new CommentExcerptTracker();
  const comments: StegoCommentThread[] = [
    {
      id: 'CMT-0001',
      status: 'open',
      paragraphIndex: 0,
      excerpt: 'some text',
      excerptStartLine: 4,
      excerptStartCol: 2,
      excerptEndLine: 4,
      excerptEndCol: 11,
      thread: ['ts | author | msg']
    },
    {
      id: 'CMT-0002',
      status: 'open',
      thread: ['ts | author | msg']
      // No excerpt coords — should not be tracked
    }
  ];

  tracker.load('file:///test.md', comments);
  const tracked = tracker.getTracked('file:///test.md');
  assert.equal(tracked?.length, 1);
  assert.equal(tracked![0].id, 'CMT-0001');
  // 1-based line 4 → 0-based line 3
  assert.deepStrictEqual(tracked![0].start, { line: 3, character: 2 });
  assert.deepStrictEqual(tracked![0].end, { line: 3, character: 11 });
});

test('CommentExcerptTracker.load ignores collapsed excerpt ranges', () => {
  const tracker = new CommentExcerptTracker();
  const comments: StegoCommentThread[] = [
    {
      id: 'CMT-0001',
      status: 'open',
      paragraphIndex: 0,
      excerpt: 'paragraph comment',
      excerptStartLine: 4,
      excerptStartCol: 0,
      excerptEndLine: 4,
      excerptEndCol: 0,
      thread: ['ts | author | msg']
    }
  ];

  tracker.load('file:///test.md', comments);
  const tracked = tracker.getTracked('file:///test.md');
  assert.equal(tracked?.length ?? 0, 0);
});

test('CommentExcerptTracker.applyChanges updates tracked entries', () => {
  const tracker = new CommentExcerptTracker();
  const comments: StegoCommentThread[] = [
    {
      id: 'CMT-0001',
      status: 'open',
      paragraphIndex: 0,
      excerptStartLine: 4,
      excerptStartCol: 0,
      excerptEndLine: 4,
      excerptEndCol: 10,
      thread: ['ts | author | msg']
    }
  ];

  tracker.load('file:///test.md', comments);
  tracker.applyChanges('file:///test.md', [change(1, 0, 1, 0, 'new line\n')]);

  const tracked = tracker.getTracked('file:///test.md');
  assert.deepStrictEqual(tracked![0].start, { line: 4, character: 0 });
  assert.deepStrictEqual(tracked![0].end, { line: 4, character: 10 });
  assert.equal(tracker.hasPendingChanges('file:///test.md'), true);
});

test('CommentExcerptTracker.getDeletedIds returns deleted comment IDs', () => {
  const tracker = new CommentExcerptTracker();
  const comments: StegoCommentThread[] = [
    {
      id: 'CMT-0001',
      status: 'open',
      paragraphIndex: 0,
      excerptStartLine: 4,
      excerptStartCol: 0,
      excerptEndLine: 4,
      excerptEndCol: 10,
      thread: ['ts | author | msg']
    }
  ];

  tracker.load('file:///test.md', comments);
  // Delete the entire line content containing the excerpt
  tracker.applyChanges('file:///test.md', [change(3, 0, 3, 15, '')]);

  const deleted = tracker.getDeletedIds('file:///test.md');
  assert.deepStrictEqual(deleted, ['CMT-0001']);
});

test('CommentExcerptTracker.getDeletedThreadIds includes thread siblings', () => {
  const tracker = new CommentExcerptTracker();
  const comments: StegoCommentThread[] = [
    {
      id: 'CMT-0001',
      status: 'open',
      paragraphIndex: 3,
      excerptStartLine: 4,
      excerptStartCol: 0,
      excerptEndLine: 4,
      excerptEndCol: 10,
      thread: ['ts | author | msg']
    },
    {
      id: 'CMT-0002',
      status: 'open',
      paragraphIndex: 3,
      excerptStartLine: 4,
      excerptStartCol: 0,
      excerptEndLine: 4,
      excerptEndCol: 10,
      thread: ['ts | author | reply']
    }
  ];

  tracker.load('file:///test.md', comments);
  // Delete excerpt
  tracker.applyChanges('file:///test.md', [change(3, 0, 3, 15, '')]);

  const deleted = tracker.getDeletedThreadIds('file:///test.md', comments);
  assert.equal(deleted.length, 2);
  assert.ok(deleted.includes('CMT-0001'));
  assert.ok(deleted.includes('CMT-0002'));
});

test('change at exact excerpt boundary (touching end) has no effect', () => {
  const entry = makeEntry(3, 0, 3, 10);
  // Insert right at the end of the excerpt — should have no effect since end is exclusive
  applyChangeToEntry(entry, change(3, 10, 3, 10, 'X'));
  // This is "change starts at end" — posIsBeforeOrEqual(entry.end, cStart) is true
  assert.deepStrictEqual(entry.start, { line: 3, character: 0 });
  assert.deepStrictEqual(entry.end, { line: 3, character: 10 });
  assert.equal(entry.dirty, false);
});

test('same-line change before excerpt on same line shifts columns', () => {
  const entry = makeEntry(3, 10, 3, 20);
  // Insert 3 chars at col 2 on same line
  applyChangeToEntry(entry, change(3, 2, 3, 2, 'XXX'));
  assert.deepStrictEqual(entry.start, { line: 3, character: 13 });
  assert.deepStrictEqual(entry.end, { line: 3, character: 23 });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAddCommentPayload,
  buildDecorationCommentEntries,
  buildSidebarCommentsState,
  buildSyncAnchorsPayload
} from '../../features/comments/commentModel';
import type { StegoCommentDocumentState } from '../../features/comments/commentTypes';

test('buildAddCommentPayload uses explicit selection range when present', () => {
  const payload = buildAddCommentPayload({
    message: 'Hello',
    author: 'Saurus',
    cursorLine: 9,
    selection: {
      startLine: 5,
      startCol: 2,
      endLine: 5,
      endCol: 10
    }
  });

  assert.equal(payload.message, 'Hello');
  assert.equal(payload.author, 'Saurus');
  assert.deepEqual(payload.anchor, {
    range: {
      start: { line: 5, col: 2 },
      end: { line: 5, col: 10 }
    }
  });
});

test('buildAddCommentPayload falls back to cursor_line when no selection', () => {
  const payload = buildAddCommentPayload({
    message: 'Hello',
    author: 'Saurus',
    cursorLine: 12
  });

  assert.deepEqual(payload.anchor, { cursor_line: 12 });
});

test('buildSidebarCommentsState projects CLI state into grouped sidebar list', () => {
  const state: StegoCommentDocumentState = {
    contentWithoutComments: 'Body',
    comments: [
      {
        id: 'CMT-0001',
        status: 'open',
        createdAt: '2026-03-01T12:00:00.000Z',
        paragraphIndex: 0,
        excerpt: 'Anchor text',
        excerptStartLine: 8,
        excerptStartCol: 1,
        excerptEndLine: 8,
        excerptEndCol: 11,
        thread: ['2026-03-01T12:00:00.000Z | mattgold | first']
      },
      {
        id: 'CMT-0002',
        status: 'resolved',
        createdAt: '2026-03-01T13:00:00.000Z',
        paragraphIndex: 0,
        excerpt: 'Anchor text',
        excerptStartLine: 8,
        excerptStartCol: 1,
        excerptEndLine: 8,
        excerptEndCol: 11,
        thread: ['2026-03-01T13:00:00.000Z | saurus | second']
      }
    ],
    parseErrors: [],
    anchorsById: {
      'CMT-0001': { anchorType: 'paragraph', line: 8, degraded: false, paragraphEndLine: 8 },
      'CMT-0002': { anchorType: 'paragraph', line: 8, degraded: false, paragraphEndLine: 8 }
    },
    totalCount: 2,
    unresolvedCount: 1
  };

  const sidebar = buildSidebarCommentsState(state, 'cmt-0002');

  assert.equal(sidebar.totalCount, 2);
  assert.equal(sidebar.unresolvedCount, 1);
  assert.equal(sidebar.selectedId, 'CMT-0002');
  assert.equal(sidebar.items.length, 2);
  assert.equal(sidebar.items[0]?.id, 'CMT-0001');
  assert.equal(sidebar.items[0]?.threadPosition, 'first');
  assert.equal(sidebar.items[1]?.id, 'CMT-0002');
  assert.equal(sidebar.items[1]?.threadPosition, 'last');
});

test('buildDecorationCommentEntries overlays tracked ranges and skips deleted entries', () => {
  const state: StegoCommentDocumentState = {
    contentWithoutComments: 'Body',
    comments: [
      {
        id: 'CMT-0001',
        status: 'open',
        paragraphIndex: 0,
        excerpt: 'A',
        excerptStartLine: 10,
        excerptStartCol: 0,
        excerptEndLine: 10,
        excerptEndCol: 5,
        thread: ['2026-03-01T12:00:00.000Z | mattgold | first']
      },
      {
        id: 'CMT-0002',
        status: 'resolved',
        paragraphIndex: 1,
        excerpt: 'B',
        excerptStartLine: 20,
        excerptStartCol: 0,
        excerptEndLine: 20,
        excerptEndCol: 5,
        thread: ['2026-03-01T12:00:00.000Z | mattgold | second']
      }
    ],
    parseErrors: [],
    anchorsById: {
      'CMT-0001': {
        anchorType: 'paragraph',
        line: 10,
        degraded: false,
        underlineStartLine: 10,
        underlineStartCol: 0,
        underlineEndLine: 10,
        underlineEndCol: 5
      },
      'CMT-0002': {
        anchorType: 'paragraph',
        line: 20,
        degraded: false,
        underlineStartLine: 20,
        underlineStartCol: 0,
        underlineEndLine: 20,
        underlineEndCol: 5
      }
    },
    totalCount: 2,
    unresolvedCount: 1
  };

  const entries = buildDecorationCommentEntries(state, [
    {
      id: 'CMT-0001',
      startLine: 11,
      startCol: 2,
      endLine: 11,
      endCol: 8,
      deleted: false
    },
    {
      id: 'CMT-0002',
      startLine: 20,
      startCol: 0,
      endLine: 20,
      endCol: 5,
      deleted: true
    }
  ]);

  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.id, 'CMT-0001');
  assert.equal(entries[0]?.underlineStartLine, 11);
  assert.equal(entries[0]?.underlineStartCol, 2);
  assert.equal(entries[0]?.underlineEndLine, 11);
  assert.equal(entries[0]?.underlineEndCol, 8);
});

test('buildSyncAnchorsPayload converts tracked entries and deduplicates deletions', () => {
  const payload = buildSyncAnchorsPayload(
    [
      {
        id: 'CMT-0001',
        dirty: true,
        deleted: false,
        start: { line: 4, character: 1 },
        end: { line: 4, character: 8 }
      },
      {
        id: 'CMT-0002',
        dirty: false,
        deleted: false,
        start: { line: 7, character: 0 },
        end: { line: 7, character: 4 }
      }
    ],
    ['cmt-0003', 'CMT-0003', '  CMT-0004  ']
  );

  assert.deepEqual(payload.updates, [
    {
      id: 'CMT-0001',
      start: { line: 5, col: 1 },
      end: { line: 5, col: 8 }
    }
  ]);
  assert.deepEqual(payload.delete_ids, ['CMT-0003', 'CMT-0004']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { getCommentThreadKey } from '../../features/comments/commentThreadKey';
import type { StegoCommentThread } from '../../features/comments/commentTypes';

function baseComment(partial: Partial<StegoCommentThread>): StegoCommentThread {
  return {
    id: 'CMT-0001',
    status: 'open',
    thread: ['2026-02-20T10:00:00Z | Author | Message'],
    ...partial
  };
}

test('thread key uses exact excerpt coordinates when present', () => {
  const paragraphComment = baseComment({ paragraphIndex: 0, excerpt: 'Paragraph' });
  const excerptCommentA = baseComment({
    paragraphIndex: 0,
    excerpt: 'Paragraph',
    excerptStartLine: 1,
    excerptStartCol: 0,
    excerptEndLine: 1,
    excerptEndCol: 9
  });
  const excerptCommentB = baseComment({
    paragraphIndex: 0,
    excerpt: 'Paragraph',
    excerptStartLine: 1,
    excerptStartCol: 0,
    excerptEndLine: 1,
    excerptEndCol: 9
  });

  assert.notEqual(getCommentThreadKey(paragraphComment), getCommentThreadKey(excerptCommentA));
  assert.equal(getCommentThreadKey(excerptCommentA), getCommentThreadKey(excerptCommentB));
});

test('thread key falls back to paragraph when excerpt range is collapsed', () => {
  const collapsed = baseComment({
    paragraphIndex: 2,
    excerptStartLine: 5,
    excerptStartCol: 3,
    excerptEndLine: 5,
    excerptEndCol: 3
  });

  assert.equal(getCommentThreadKey(collapsed), 'paragraph:2');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCommentAnchor, type ParagraphInfo } from '../../features/comments/commentAnchors';
import type { StegoCommentThread } from '../../features/comments/commentTypes';

test('resolveCommentAnchor falls back to paragraph underline when excerpt range is collapsed', () => {
  const paragraphs: ParagraphInfo[] = [
    {
      index: 0,
      startLine: 4,
      endLine: 6,
      text: 'Paragraph text'
    }
  ];

  const comment: StegoCommentThread = {
    id: 'CMT-0001',
    status: 'open',
    paragraphIndex: 0,
    excerpt: 'Paragraph text',
    excerptStartLine: 4,
    excerptStartCol: 0,
    excerptEndLine: 4,
    excerptEndCol: 0,
    thread: ['2026-02-20T00:00:00Z | Tester | Hello']
  };

  const anchor = resolveCommentAnchor(comment, paragraphs);
  assert.equal(anchor.line, 4);
  assert.equal(anchor.paragraphEndLine, 6);
  assert.equal(anchor.underlineStartLine, undefined);
  assert.equal(anchor.underlineEndLine, undefined);
});

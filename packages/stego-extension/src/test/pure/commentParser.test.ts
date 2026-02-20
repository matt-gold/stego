import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommentAppendix, serializeCommentAppendix, upsertCommentAppendix } from '../../features/comments/commentParser';
import type { StegoCommentThread } from '../../features/comments/commentTypes';

function encodeMeta(meta: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(meta), 'utf8').toString('base64url');
}

test('comment parser accepts strict blockquote format with sparse metadata', () => {
  const markdown = [
    'Body paragraph.',
    '',
    '<!-- stego-comments:start -->',
    '',
    '<!-- comment: CMT-0001 -->',
    `<!-- meta64: ${encodeMeta({
      status: 'open',
      anchor: 'paragraph',
      paragraph_index: 12,
      signature: 'fnv1a:7f2d13aa',
      excerpt: 'At Hotel-Dieu, prayer and treatment proceeded in one rhythm.'
    })} -->`,
    '> _2026-02-19T22:17:00Z | Matt Gold_',
    '>',
    '> Is this chronology right?',
    '',
    '<!-- comment: CMT-0002 -->',
    `<!-- meta64: ${encodeMeta({
      status: 'resolved',
      anchor: 'file'
    })} -->`,
    '> _2026-02-19T23:01:00Z | Matt Gold_',
    '>',
    '> Verify this source.',
    '',
    '<!-- stego-comments:end -->',
    ''
  ].join('\n');

  const parsed = parseCommentAppendix(markdown);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.comments.length, 2);
  assert.equal(parsed.comments[0].id, 'CMT-0001');
  assert.equal(parsed.comments[0].anchor, 'paragraph');
  assert.equal(parsed.comments[1].status, 'resolved');
  assert.equal(parsed.contentWithoutComments, 'Body paragraph.');
});

test('comment parser rejects malformed quote lines and malformed thread rows', () => {
  const markdown = [
    'Body',
    '<!-- stego-comments:start -->',
    '<!-- comment: CMT-0001 -->',
    '- bad row',
    `<!-- meta64: ${encodeMeta({ status: 'open', anchor: 'paragraph' })} -->`,
    '> malformed header',
    '>',
    '> missing separators',
    '<!-- stego-comments:end -->'
  ].join('\n');

  const parsed = parseCommentAppendix(markdown);
  assert.ok(parsed.errors.some((error) => error.includes('Invalid comment metadata row')));
  assert.ok(parsed.errors.some((error) => error.includes('Invalid thread header')));
});

test('comment parser rejects multiple messages under one comment id', () => {
  const markdown = [
    'Body',
    '<!-- stego-comments:start -->',
    '<!-- comment: CMT-0001 -->',
    `<!-- meta64: ${encodeMeta({ status: 'open', anchor: 'paragraph', paragraph_index: 0, signature: 'fnv1a:abc' })} -->`,
    '> _2026-02-19T22:17:00Z | Matt Gold_',
    '>',
    '> first message',
    '',
    '> _2026-02-19T22:19:03Z | Reviewer_',
    '>',
    '> second message',
    '<!-- stego-comments:end -->'
  ].join('\n');

  const parsed = parseCommentAppendix(markdown);
  assert.ok(parsed.errors.some((error) => error.includes('Multiple message blocks found')));
});

test('comment parser rejects legacy metadata rows', () => {
  const markdown = [
    'Body',
    '<!-- stego-comments:start -->',
    '<!-- comment: CMT-0001 -->',
    '> - [ ] status: open',
    '> - anchor: paragraph',
    '> _2026-02-19T22:17:00Z | Matt Gold_',
    '>',
    '> legacy row',
    '<!-- stego-comments:end -->'
  ].join('\n');

  const parsed = parseCommentAppendix(markdown);
  assert.ok(parsed.errors.some((error) => error.includes('meta64')));
});

test('comment serializer roundtrips parse->serialize->parse', () => {
  const comments: StegoCommentThread[] = [
    {
      id: 'CMT-0001',
      status: 'open',
      anchor: 'paragraph',
      paragraphIndex: 2,
      signature: 'fnv1a:abcd1234',
      excerpt: 'Paragraph text',
      thread: ['2026-02-19T22:17:00Z | Matt Gold | Test comment']
    }
  ];

  const appendix = serializeCommentAppendix(comments);
  const withAppendix = upsertCommentAppendix('Body text.', comments);
  const parsed = parseCommentAppendix(withAppendix);

  assert.equal(parsed.errors.length, 0);
  assert.equal(appendix.includes('<!-- meta64:'), true);
  assert.equal(appendix.includes('> _2026-02-19T22:17:00Z | Matt Gold_'), true);
  assert.equal(parsed.comments.length, 1);
  assert.equal(parsed.comments[0].id, comments[0].id);
  assert.equal(parsed.comments[0].status, comments[0].status);
  assert.equal(parsed.comments[0].anchor, comments[0].anchor);
  assert.equal(parsed.comments[0].paragraphIndex, comments[0].paragraphIndex);
  assert.equal(parsed.comments[0].signature, comments[0].signature);
  assert.equal(parsed.comments[0].excerpt, comments[0].excerpt);
  assert.deepEqual(parsed.comments[0].thread, comments[0].thread);
});

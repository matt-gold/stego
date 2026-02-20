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
      paragraph_index: 12
    })} -->`,
    '> _Feb 19, 2026, 10:17 PM — Matt Gold_',
    '>',
    '> > \u201cAt Hotel-Dieu, prayer and treatment proceeded in one rhythm.\u201d',
    '>',
    '> Is this chronology right?',
    '',
    '<!-- comment: CMT-0002 -->',
    `<!-- meta64: ${encodeMeta({
      status: 'resolved'
    })} -->`,
    '> _Feb 19, 2026, 11:01 PM — Matt Gold_',
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
  assert.equal(parsed.comments[0].paragraphIndex, 12);
  assert.equal(parsed.comments[0].excerpt, 'At Hotel-Dieu, prayer and treatment proceeded in one rhythm.');
  assert.equal(parsed.comments[1].status, 'resolved');
  assert.equal(parsed.contentWithoutComments, 'Body paragraph.');
});

test('comment parser rejects malformed quote lines and malformed thread rows', () => {
  const markdown = [
    'Body',
    '<!-- stego-comments:start -->',
    '<!-- comment: CMT-0001 -->',
    '- bad row',
    `<!-- meta64: ${encodeMeta({ status: 'open', paragraph_index: 0 })} -->`,
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
    `<!-- meta64: ${encodeMeta({ status: 'open', paragraph_index: 0 })} -->`,
    '> _Feb 19, 2026, 10:17 PM — Matt Gold_',
    '>',
    '> first message',
    '',
    '> _Feb 19, 2026, 10:19 PM — Reviewer_',
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
    '> _Feb 19, 2026, 10:17 PM — Matt Gold_',
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
      paragraphIndex: 2,
      excerpt: 'Paragraph text that is short enough to not be truncated',
      thread: ['2026-02-19T22:17:00Z | Matt Gold | Test comment']
    }
  ];

  const appendix = serializeCommentAppendix(comments);
  const withAppendix = upsertCommentAppendix('Body text.', comments);
  const parsed = parseCommentAppendix(withAppendix);

  assert.equal(parsed.errors.length, 0);
  assert.equal(appendix.includes('<!-- meta64:'), true);
  assert.equal(appendix.includes('> _Feb 19, 2026, 10:17 PM — Matt Gold_'), true);
  assert.ok(appendix.includes('> > \u201cParagraph text that is short enough to not be truncated\u201d'));
  assert.equal(parsed.comments.length, 1);
  assert.equal(parsed.comments[0].id, comments[0].id);
  assert.equal(parsed.comments[0].status, comments[0].status);
  assert.equal(parsed.comments[0].paragraphIndex, comments[0].paragraphIndex);
  assert.equal(parsed.comments[0].excerpt, comments[0].excerpt);
  // Thread entry timestamp gets formatted on first roundtrip
  assert.deepEqual(parsed.comments[0].thread, ['Feb 19, 2026, 10:17 PM | Matt Gold | Test comment']);

  // Second roundtrip is stable
  const appendix2 = serializeCommentAppendix(parsed.comments);
  const withAppendix2 = upsertCommentAppendix('Body text.', parsed.comments);
  const parsed2 = parseCommentAppendix(withAppendix2);
  assert.equal(parsed2.errors.length, 0);
  assert.deepEqual(parsed2.comments[0].thread, parsed.comments[0].thread);
  assert.equal(parsed2.comments[0].excerpt, parsed.comments[0].excerpt);
});

test('comment serializer truncates long excerpts to 100 chars', () => {
  const longExcerpt = 'At Hotel-Dieu, prayer and treatment proceeded in one rhythm with the sick. And lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';
  const comments: StegoCommentThread[] = [
    {
      id: 'CMT-0001',
      status: 'open',
      paragraphIndex: 2,
      excerpt: longExcerpt,
      thread: ['2026-02-19T22:17:00Z | Matt Gold | Test comment']
    }
  ];

  const appendix = serializeCommentAppendix(comments);
  const expectedTruncated = longExcerpt.slice(0, 100).trimEnd() + '\u2026';
  assert.ok(appendix.includes(`> > \u201c${expectedTruncated}\u201d`));

  const withAppendix = upsertCommentAppendix('Body text.', comments);
  const parsed = parseCommentAppendix(withAppendix);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.comments[0].excerpt, expectedTruncated);
});

test('file-level comments omit excerpt line', () => {
  const comments: StegoCommentThread[] = [
    {
      id: 'CMT-0001',
      status: 'open',
      excerpt: 'Should not appear',
      thread: ['2026-02-19T22:17:00Z | Matt Gold | File-level comment']
    }
  ];

  const appendix = serializeCommentAppendix(comments);
  assert.ok(!appendix.includes('> >'));
});

test('comment parser roundtrips createdAt and timezone metadata', () => {
  const comments: StegoCommentThread[] = [
    {
      id: 'CMT-0001',
      status: 'open',
      createdAt: '2026-02-20T12:00:00.000Z',
      timezone: 'America/New_York',
      timezoneOffsetMinutes: -300,
      paragraphIndex: 0,
      thread: ['2026-02-20T12:00:00.000Z | Matt Gold | Test comment']
    }
  ];

  const withAppendix = upsertCommentAppendix('Body text.', comments);
  const parsed = parseCommentAppendix(withAppendix);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.comments[0].createdAt, '2026-02-20T12:00:00.000Z');
  assert.equal(parsed.comments[0].timezone, 'America/New_York');
  assert.equal(parsed.comments[0].timezoneOffsetMinutes, -300);
  assert.equal(parsed.comments[0].thread[0], '2026-02-20T12:00:00.000Z | Matt Gold | Test comment');
});

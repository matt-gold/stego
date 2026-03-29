import test from 'node:test';
import assert from 'node:assert/strict';
import { compareOverviewStatus, countOverviewWords } from '../../features/sidebar/tabs/overview/overviewMetrics';

test('compareOverviewStatus ranks known stage order before unknown statuses', () => {
  assert.ok(compareOverviewStatus('draft', 'revise') < 0);
  assert.ok(compareOverviewStatus('line-edit', 'final') < 0);
  assert.ok(compareOverviewStatus('custom', 'final') > 0);
  assert.ok(compareOverviewStatus('(missing)', 'final') > 0);
  assert.ok(compareOverviewStatus('custom', '(missing)') > 0);
});

test('countOverviewWords ignores fenced code blocks', () => {
  const value = countOverviewWords([
    'One two three.',
    '```',
    'code block should not count',
    '```',
    'Four five.'
  ].join('\n'));

  assert.equal(value, 5);
});

test('countOverviewWords matches shared markdown-aware tokenization', () => {
  const value = countOverviewWords([
    'Hello **world** and [friends](https://example.com).',
    '',
    '![Alt text](./image.png)',
    '',
    '`inline code` should not count.'
  ].join('\n'));

  assert.equal(value, 9);
});

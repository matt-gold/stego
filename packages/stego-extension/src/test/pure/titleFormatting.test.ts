import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTitleWords, getSidebarFileTitle } from '../../features/sidebar/sidebarToc';

test('getSidebarFileTitle converts numbered kebab case filenames', () => {
  const parsed = getSidebarFileTitle('/tmp/200-the-fall-of-rome.md');
  assert.equal(parsed.title, 'The Fall of Rome');
  assert.equal(parsed.filename, '200-the-fall-of-rome.md');
});

test('getSidebarFileTitle falls back to filename when pattern does not match', () => {
  const parsed = getSidebarFileTitle('/tmp/notes.md');
  assert.equal(parsed.title, 'notes.md');
});

test('formatTitleWords keeps minor words lowercase except edges', () => {
  assert.equal(formatTitleWords(['the', 'fall', 'of', 'rome']), 'The Fall of Rome');
  assert.equal(formatTitleWords(['war', 'and', 'peace']), 'War and Peace');
});

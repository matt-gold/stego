import test from 'node:test';
import assert from 'node:assert/strict';
import { isLeafFileInContent } from '@stego-labs/shared/domain/content';
import { formatTitleWords, getSidebarFileTitle } from '../../features/sidebar/tabs/document/sidebarToc';

test('getSidebarFileTitle converts numbered kebab case filenames', () => {
  const parsed = getSidebarFileTitle('/tmp/200-the-fall-of-rome.md');
  assert.equal(parsed.title, 'The Fall of Rome');
  assert.equal(parsed.filename, '200-the-fall-of-rome.md');
});

test('getSidebarFileTitle falls back to filename when pattern does not match', () => {
  const parsed = getSidebarFileTitle('/tmp/notes.md');
  assert.equal(parsed.title, 'notes.md');
});

test('getSidebarFileTitle falls back to the branch directory name for _branch notes', () => {
  const parsed = getSidebarFileTitle('/tmp/project/content/reference/characters/_branch.md');
  assert.equal(parsed.title, 'characters');
  assert.equal(parsed.filename, '_branch.md');
});

test('getSidebarFileTitle uses preferred title when provided', () => {
  const parsed = getSidebarFileTitle('/tmp/200-the-fall-of-rome.md', 'Custom Label');
  assert.equal(parsed.title, 'Custom Label');
  assert.equal(parsed.filename, '200-the-fall-of-rome.md');
});

test('getSidebarFileTitle prefers explicit branch labels over the directory fallback', () => {
  const parsed = getSidebarFileTitle('/tmp/project/content/reference/characters/_branch.md', 'Characters');
  assert.equal(parsed.title, 'Characters');
  assert.equal(parsed.filename, '_branch.md');
});

test('getSidebarFileTitle ignores blank preferred title', () => {
  const parsed = getSidebarFileTitle('/tmp/200-the-fall-of-rome.md', '   ');
  assert.equal(parsed.title, 'The Fall of Rome');
});

test('formatTitleWords keeps minor words lowercase except edges', () => {
  assert.equal(formatTitleWords(['the', 'fall', 'of', 'rome']), 'The Fall of Rome');
  assert.equal(formatTitleWords(['war', 'and', 'peace']), 'War and Peace');
});

test('isLeafFileInContent recognizes generic leaf files under content', () => {
  assert.equal(isLeafFileInContent('/tmp/project/content', '/tmp/project/content/100-scene.md'), true);
  assert.equal(isLeafFileInContent('/tmp/project/content', '/tmp/project/content/_branch.md'), false);
  assert.equal(isLeafFileInContent('/tmp/project/content', '/tmp/project/content/reference/characters/CHAR-AGNES.md'), true);
});

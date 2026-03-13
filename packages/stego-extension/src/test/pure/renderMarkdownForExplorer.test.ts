import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdownForExplorer } from '../../features/sidebar/webview/renderMarkdownForExplorer';

test('renderMarkdownForExplorer rewrites image src using resolver', () => {
  const html = renderMarkdownForExplorer('![Map](../assets/maps/city.png)', {
    basePath: '/tmp/project/spine/characters/example.md',
    resolveImageSrc: (rawSrc, basePath) => `resolved://${basePath ?? ''}/${rawSrc}`
  });

  assert.match(html, /<img[^>]+src="resolved:\/\/\/tmp\/project\/spine\/characters\/example\.md\/\.\.\/assets\/maps\/city\.png"/);
});

test('renderMarkdownForExplorer adds base-path data attribute when provided', () => {
  const html = renderMarkdownForExplorer('Body text', { basePath: '/tmp/project/spine/characters/example.md' });

  assert.match(html, /data-base-path="\/tmp\/project\/spine\/characters\/example\.md"/);
});

import MarkdownIt from 'markdown-it';
import { escapeAttribute } from './renderUtils';

const EXPLORER_MARKDOWN_RENDERER = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true
});

export function renderMarkdownForExplorer(rawText: string, basePath?: string): string {
  const rendered = EXPLORER_MARKDOWN_RENDERER.render(rawText);
  const basePathAttr = basePath ? ` data-base-path="${escapeAttribute(basePath)}"` : '';
  return `<div class="md-rendered"${basePathAttr}>${rendered}</div>`;
}

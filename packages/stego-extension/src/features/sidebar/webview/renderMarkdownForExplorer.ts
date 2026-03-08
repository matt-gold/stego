import MarkdownIt from 'markdown-it';
import { escapeAttribute } from './renderUtils';

const EXPLORER_MARKDOWN_RENDERER = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true
});

export type MarkdownImageSrcResolver = (rawSrc: string, basePath?: string) => string | undefined;

type RenderMarkdownOptions = {
  basePath?: string;
  resolveImageSrc?: MarkdownImageSrcResolver;
};

const defaultImageRenderer = EXPLORER_MARKDOWN_RENDERER.renderer.rules.image
  ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

EXPLORER_MARKDOWN_RENDERER.renderer.rules.image = (tokens, idx, options, env, self): string => {
  const token = tokens[idx];
  const src = token.attrGet('src');
  const envRecord = env && typeof env === 'object' ? env as Record<string, unknown> : undefined;
  const basePath = typeof envRecord?.basePath === 'string' ? envRecord.basePath : undefined;
  const resolveImageSrc = typeof envRecord?.resolveImageSrc === 'function'
    ? envRecord.resolveImageSrc as MarkdownImageSrcResolver
    : undefined;
  if (src && resolveImageSrc) {
    const resolved = resolveImageSrc(src, basePath);
    if (resolved) {
      token.attrSet('src', resolved);
    }
  }

  return defaultImageRenderer(tokens, idx, options, env, self);
};

function normalizeRenderOptions(options?: string | RenderMarkdownOptions): RenderMarkdownOptions {
  if (!options) {
    return {};
  }
  if (typeof options === 'string') {
    return { basePath: options };
  }
  return options;
}

export function renderMarkdownForExplorer(rawText: string, options?: string | RenderMarkdownOptions): string {
  const resolvedOptions = normalizeRenderOptions(options);
  const rendered = EXPLORER_MARKDOWN_RENDERER.render(rawText, {
    basePath: resolvedOptions.basePath,
    resolveImageSrc: resolvedOptions.resolveImageSrc
  });
  const basePathAttr = resolvedOptions.basePath ? ` data-base-path="${escapeAttribute(resolvedOptions.basePath)}"` : '';
  return `<div class="md-rendered"${basePathAttr}>${rendered}</div>`;
}

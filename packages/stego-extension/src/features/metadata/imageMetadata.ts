import * as path from 'path';
import {
  IMAGE_GLOBAL_KEYS,
  asPlainRecord,
  cloneImageStyle,
  extractImageDestinationTarget,
  isExternalImageTarget,
  isImageStyleEmpty,
  mergeImageStyles,
  normalizeImagePathKey,
  parseImageStyle,
  stripImageQueryAndAnchor,
  type ImageStyle
} from '@stego-labs/shared/domain/images';
import type { SidebarImageEntry } from '../../shared/types';

type MarkdownImageToken = {
  destination: string;
  line: number;
};

function collectMarkdownImageTokens(body: string): MarkdownImageToken[] {
  const lineEnding = body.includes('\r\n') ? '\r\n' : '\n';
  const lines = body.split(lineEnding);
  const imageRegex = /!\[[^\]]*]\(([^)]+)\)(?:\s*\{[^{}]*\})?/g;
  const tokens: MarkdownImageToken[] = [];
  let openFence: { marker: string; length: number } | undefined;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const trimmed = line.trimStart();
    const fenceMatch = trimmed.match(/^(```+|~~~+)/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      const length = fenceMatch[1].length;
      if (!openFence) {
        openFence = { marker, length };
      } else if (openFence.marker === marker && length >= openFence.length) {
        openFence = undefined;
      }
      continue;
    }

    if (openFence) {
      continue;
    }

    imageRegex.lastIndex = 0;
    let match = imageRegex.exec(line);
    while (match) {
      const target = extractImageDestinationTarget(match[1] ?? '');
      if (target) {
        tokens.push({
          destination: target,
          line: lineIndex + 1
        });
      }
      match = imageRegex.exec(line);
    }
  }

  return tokens;
}

function resolveImageKey(
  destination: string,
  chapterPath: string,
  projectDir: string
): { key: string; displayPath: string; isExternal: boolean } {
  if (isExternalImageTarget(destination) || destination.startsWith('#')) {
    return {
      key: destination,
      displayPath: destination,
      isExternal: true
    };
  }

  const cleanTarget = stripImageQueryAndAnchor(destination);
  if (!cleanTarget) {
    return {
      key: destination,
      displayPath: destination,
      isExternal: true
    };
  }

  const chapterDir = path.dirname(chapterPath);
  const resolvedPath = path.resolve(chapterDir, cleanTarget);
  const relativeToProject = path.relative(projectDir, resolvedPath);
  if (!relativeToProject || relativeToProject.startsWith('..') || path.isAbsolute(relativeToProject)) {
    const normalizedTarget = normalizeImagePathKey(cleanTarget);
    return {
      key: normalizedTarget,
      displayPath: normalizedTarget,
      isExternal: false
    };
  }

  const normalized = normalizeImagePathKey(relativeToProject);
  return {
    key: normalized,
    displayPath: normalized,
    isExternal: false
  };
}

export function parseProjectImageDefaults(rawProject: unknown): ImageStyle {
  const record = asPlainRecord(rawProject);
  if (!record) {
    return {};
  }

  const imagesRecord = asPlainRecord(record.images);
  if (!imagesRecord) {
    return {};
  }

  const defaultsInput: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(imagesRecord)) {
    if (IMAGE_GLOBAL_KEYS.has(key)) {
      defaultsInput[key] = value;
    }
  }

  const defaults = parseImageStyle(defaultsInput);
  return defaults ?? {};
}

export function readImageOverride(frontmatter: Record<string, unknown>, key: string): ImageStyle | undefined {
  const imagesRecord = asPlainRecord(frontmatter.images);
  if (!imagesRecord) {
    return undefined;
  }

  return parseImageStyle(imagesRecord[key]);
}

export function setImageOverride(
  frontmatter: Record<string, unknown>,
  key: string,
  override: ImageStyle | undefined
): void {
  const existing = asPlainRecord(frontmatter.images);
  const imagesRecord: Record<string, unknown> = existing ? { ...existing } : {};
  if (!override || isImageStyleEmpty(override)) {
    delete imagesRecord[key];
  } else {
    imagesRecord[key] = override;
  }

  if (Object.keys(imagesRecord).length === 0) {
    delete frontmatter.images;
    return;
  }
  frontmatter.images = imagesRecord;
}

export function parseImageOverrideInput(input: unknown): ImageStyle | undefined {
  return parseImageStyle(input);
}

export function formatImageStyleSummary(style: ImageStyle): string {
  const parts: string[] = [];
  if (style.width) {
    parts.push(`width=${style.width}`);
  }
  if (style.height) {
    parts.push(`height=${style.height}`);
  }
  if (style.id) {
    parts.push(`#${style.id}`);
  }
  if (style.layout) {
    parts.push(`layout=${style.layout}`);
  }
  if (style.align) {
    parts.push(`align=${style.align}`);
  }
  if (style.classes && style.classes.length > 0) {
    parts.push(`classes=${style.classes.join(', ')}`);
  }
  if (style.attrs && Object.keys(style.attrs).length > 0) {
    const attrs = Object.entries(style.attrs)
      .filter(([key]) => key !== 'data-layout' && key !== 'data-align')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    if (attrs.length > 0) {
      parts.push(`attrs={${attrs}}`);
    }
  }

  return parts.length > 0 ? parts.join(' | ') : 'none';
}

export function buildSidebarImageEntries(options: {
  body: string;
  frontmatter: Record<string, unknown>;
  chapterPath: string;
  projectDir: string;
  projectDefaults: ImageStyle;
}): SidebarImageEntry[] {
  const tokens = collectMarkdownImageTokens(options.body);
  if (tokens.length === 0) {
    return [];
  }

  const byKey = new Map<string, SidebarImageEntry>();
  for (const token of tokens) {
    const resolved = resolveImageKey(token.destination, options.chapterPath, options.projectDir);
    const overrideStyle = readImageOverride(options.frontmatter, resolved.key) ?? {};
    const defaultStyle = cloneImageStyle(options.projectDefaults);
    const effectiveStyle = mergeImageStyles(defaultStyle, overrideStyle);
    const existing = byKey.get(resolved.key);
    if (existing) {
      existing.occurrenceCount += 1;
      if (token.line < existing.line) {
        existing.line = token.line;
      }
      continue;
    }

    byKey.set(resolved.key, {
      key: resolved.key,
      displayPath: resolved.displayPath,
      destination: token.destination,
      line: token.line,
      occurrenceCount: 1,
      isExternal: resolved.isExternal,
      hasOverride: !isImageStyleEmpty(overrideStyle),
      defaultStyle,
      overrideStyle,
      effectiveStyle
    });
  }

  return [...byKey.values()].sort((a, b) => {
    if (a.line !== b.line) {
      return a.line - b.line;
    }
    return a.displayPath.localeCompare(b.displayPath);
  });
}

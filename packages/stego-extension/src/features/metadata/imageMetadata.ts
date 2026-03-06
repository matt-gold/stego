import * as path from 'path';
import type { ImageStyle, SidebarImageEntry } from '../../shared/types';

const IMAGE_STYLE_KEYS = ['width', 'height', 'classes', 'id', 'attrs', 'layout', 'align'] as const;
const IMAGE_STYLE_KEY_SET = new Set<string>(IMAGE_STYLE_KEYS);

type MarkdownImageToken = {
  destination: string;
  line: number;
};

function asPlainRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function normalizeScalar(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    return undefined;
  }
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeClasses(value: unknown): string[] | undefined {
  if (typeof value === 'string') {
    const classes = value
      .split(/\s+/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    return classes.length > 0 ? classes : undefined;
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  const classes: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      return undefined;
    }
    const normalized = item.trim();
    if (!normalized) {
      continue;
    }
    classes.push(normalized);
  }
  return classes.length > 0 ? classes : undefined;
}

function normalizeAttrs(value: unknown): Record<string, string> | undefined {
  const record = asPlainRecord(value);
  if (!record) {
    return undefined;
  }

  const attrs: Record<string, string> = {};
  for (const [key, raw] of Object.entries(record)) {
    const normalized = normalizeScalar(raw);
    if (!normalized) {
      continue;
    }
    attrs[key] = normalized;
  }

  return Object.keys(attrs).length > 0 ? attrs : undefined;
}

function isEmptyStyle(style: ImageStyle): boolean {
  return !style.width
    && !style.height
    && !style.id
    && !style.layout
    && !style.align
    && (!style.classes || style.classes.length === 0)
    && (!style.attrs || Object.keys(style.attrs).length === 0);
}

function cloneStyle(style: ImageStyle): ImageStyle {
  return {
    width: style.width,
    height: style.height,
    id: style.id,
    classes: style.classes ? [...style.classes] : undefined,
    attrs: style.attrs ? { ...style.attrs } : undefined,
    layout: style.layout,
    align: style.align
  };
}

function mergeStyles(base: ImageStyle, override: ImageStyle): ImageStyle {
  const merged = cloneStyle(base);

  if (override.width) {
    merged.width = override.width;
  }
  if (override.height) {
    merged.height = override.height;
  }
  if (override.id) {
    merged.id = override.id;
  }
  if (override.layout) {
    merged.layout = override.layout;
  }
  if (override.align) {
    merged.align = override.align;
  }
  if (override.classes && override.classes.length > 0) {
    merged.classes = [...override.classes];
  }

  const attrs = { ...(merged.attrs ?? {}) };
  for (const [key, value] of Object.entries(override.attrs ?? {})) {
    attrs[key] = value;
  }
  merged.attrs = Object.keys(attrs).length > 0 ? attrs : undefined;

  return merged;
}

function extractDestinationTarget(value: string): string {
  let target = value.trim();
  if (target.startsWith('<') && target.endsWith('>')) {
    target = target.slice(1, -1).trim();
  }

  return target
    .split(/\s+"/)[0]
    .split(/\s+'/)[0]
    .trim();
}

function stripQueryAndAnchor(target: string): string {
  return target.split('#')[0].split('?')[0].trim();
}

function isExternalTarget(target: string): boolean {
  return target.startsWith('http://')
    || target.startsWith('https://')
    || target.startsWith('mailto:')
    || target.startsWith('tel:')
    || target.startsWith('data:');
}

function normalizePathKey(value: string): string {
  return value.trim().replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

function parseImageStyle(value: unknown): ImageStyle | undefined {
  const record = asPlainRecord(value);
  if (!record) {
    return undefined;
  }

  const style: ImageStyle = {};
  for (const [key, raw] of Object.entries(record)) {
    if (!IMAGE_STYLE_KEY_SET.has(key)) {
      continue;
    }

    if (key === 'width' || key === 'height' || key === 'id') {
      const normalized = normalizeScalar(raw);
      if (normalized) {
        style[key] = normalized;
      }
      continue;
    }

    if (key === 'layout') {
      if (raw === 'block' || raw === 'inline') {
        style.layout = raw;
      }
      continue;
    }

    if (key === 'align') {
      if (raw === 'left' || raw === 'center' || raw === 'right') {
        style.align = raw;
      }
      continue;
    }

    if (key === 'classes') {
      const normalized = normalizeClasses(raw);
      if (normalized) {
        style.classes = normalized;
      }
      continue;
    }

    if (key === 'attrs') {
      const normalized = normalizeAttrs(raw);
      if (normalized) {
        style.attrs = normalized;
      }
      continue;
    }
  }

  const layoutFromAttrs = style.attrs?.['data-layout'];
  if (!style.layout && (layoutFromAttrs === 'block' || layoutFromAttrs === 'inline')) {
    style.layout = layoutFromAttrs;
  }
  const alignFromAttrs = style.attrs?.['data-align'];
  if (!style.align && (alignFromAttrs === 'left' || alignFromAttrs === 'center' || alignFromAttrs === 'right')) {
    style.align = alignFromAttrs;
  }

  return isEmptyStyle(style) ? undefined : style;
}

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
      const target = extractDestinationTarget(match[1] ?? '');
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
  if (isExternalTarget(destination) || destination.startsWith('#')) {
    return {
      key: destination,
      displayPath: destination,
      isExternal: true
    };
  }

  const cleanTarget = stripQueryAndAnchor(destination);
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
    const normalizedTarget = normalizePathKey(cleanTarget);
    return {
      key: normalizedTarget,
      displayPath: normalizedTarget,
      isExternal: false
    };
  }

  const normalized = normalizePathKey(relativeToProject);
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

  const defaults = parseImageStyle(imagesRecord);
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
  if (!override || isEmptyStyle(override)) {
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
    const defaultStyle = cloneStyle(options.projectDefaults);
    const effectiveStyle = mergeStyles(defaultStyle, overrideStyle);
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
      hasOverride: !isEmptyStyle(overrideStyle),
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

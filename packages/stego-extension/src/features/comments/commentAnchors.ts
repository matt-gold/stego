import type { StegoCommentThread } from './commentTypes';

export type ParagraphInfo = {
  index: number;
  startLine: number;
  endLine: number;
  text: string;
  signature: string;
};

export type ResolvedCommentAnchor = {
  anchorType: 'paragraph' | 'file';
  line: number;
  degraded: boolean;
};

export function extractParagraphs(markdownText: string): ParagraphInfo[] {
  const lines = markdownText.split(/\r?\n/);
  const paragraphs: ParagraphInfo[] = [];

  let currentStart = -1;
  const currentLines: string[] = [];

  const flush = (endIndex: number): void => {
    if (currentStart < 0 || currentLines.length === 0) {
      return;
    }

    const joined = currentLines.join(' ').replace(/\s+/g, ' ').trim();
    if (joined.length > 0) {
      paragraphs.push({
        index: paragraphs.length,
        startLine: currentStart + 1,
        endLine: endIndex + 1,
        text: joined,
        signature: `fnv1a:${hashFnv1a(joined.toLowerCase())}`
      });
    }

    currentStart = -1;
    currentLines.length = 0;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      flush(i - 1);
      continue;
    }

    if (currentStart < 0) {
      currentStart = i;
    }
    currentLines.push(trimmed);
  }

  flush(lines.length - 1);
  return paragraphs;
}

export function resolveCommentAnchor(comment: StegoCommentThread, paragraphs: ParagraphInfo[]): ResolvedCommentAnchor {
  if (comment.anchor === 'file') {
    return {
      anchorType: 'file',
      line: 1,
      degraded: false
    };
  }

  let matched: ParagraphInfo | undefined;
  if (comment.signature) {
    matched = paragraphs.find((paragraph) => paragraph.signature === comment.signature);
  }

  if (!matched && comment.paragraphIndex !== undefined) {
    matched = paragraphs.find((paragraph) => paragraph.index === comment.paragraphIndex);
  }

  if (matched) {
    return {
      anchorType: 'paragraph',
      line: matched.startLine,
      degraded: false
    };
  }

  if (comment.paragraphIndex !== undefined) {
    for (let index = comment.paragraphIndex - 1; index >= 0; index -= 1) {
      const previous = paragraphs.find((paragraph) => paragraph.index === index);
      if (previous) {
        return {
          anchorType: 'paragraph',
          line: previous.startLine,
          degraded: true
        };
      }
    }
  }

  return {
    anchorType: 'file',
    line: 1,
    degraded: true
  };
}

export function findParagraphForLine(paragraphs: ParagraphInfo[], lineNumber: number): ParagraphInfo | undefined {
  return paragraphs.find((paragraph) => lineNumber >= paragraph.startLine && lineNumber <= paragraph.endLine);
}

export function findPreviousParagraphForLine(paragraphs: ParagraphInfo[], lineNumber: number): ParagraphInfo | undefined {
  for (let i = paragraphs.length - 1; i >= 0; i -= 1) {
    if (paragraphs[i].endLine < lineNumber) {
      return paragraphs[i];
    }
  }

  return undefined;
}

function hashFnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = (hash * 0x01000193) >>> 0;
  }

  return hash.toString(16).padStart(8, '0');
}

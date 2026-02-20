import type { StegoCommentThread } from './commentTypes';

export type ParagraphInfo = {
  index: number;
  startLine: number;
  endLine: number;
  text: string;
};

export type ResolvedCommentAnchor = {
  anchorType: 'paragraph' | 'file';
  line: number;
  degraded: boolean;
  underlineStartLine?: number;
  underlineStartCol?: number;
  underlineEndLine?: number;
  underlineEndCol?: number;
  paragraphEndLine?: number;
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
        text: joined
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
  if (comment.paragraphIndex === undefined) {
    return {
      anchorType: 'file',
      line: 1,
      degraded: false
    };
  }

  const matched = paragraphs.find((paragraph) => paragraph.index === comment.paragraphIndex);

  if (matched) {
    const anchor: ResolvedCommentAnchor = {
      anchorType: 'paragraph',
      line: matched.startLine,
      degraded: false
    };

    if (hasValidExcerptRange(comment)) {
      anchor.underlineStartLine = comment.excerptStartLine;
      anchor.underlineStartCol = comment.excerptStartCol;
      anchor.underlineEndLine = comment.excerptEndLine;
      anchor.underlineEndCol = comment.excerptEndCol;
    } else {
      anchor.paragraphEndLine = matched.endLine;
    }

    return anchor;
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

function hasValidExcerptRange(comment: StegoCommentThread): boolean {
  if (
    comment.excerptStartLine === undefined ||
    comment.excerptStartCol === undefined ||
    comment.excerptEndLine === undefined ||
    comment.excerptEndCol === undefined
  ) {
    return false;
  }

  const startsBeforeEnd =
    comment.excerptStartLine < comment.excerptEndLine
    || (comment.excerptStartLine === comment.excerptEndLine && comment.excerptStartCol < comment.excerptEndCol);

  return startsBeforeEnd;
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


import type { ParsedCommentAppendix, StegoCommentAnchorType, StegoCommentStatus, StegoCommentThread } from './commentTypes';

const START_SENTINEL = '<!-- stego-comments:start -->';
const END_SENTINEL = '<!-- stego-comments:end -->';

export function parseCommentAppendix(markdown: string): ParsedCommentAppendix {
  const lineEnding = markdown.includes('\r\n') ? '\r\n' : '\n';
  const lines = markdown.split(/\r?\n/);

  const startIndexes = indexesOfTrimmedLine(lines, START_SENTINEL);
  const endIndexes = indexesOfTrimmedLine(lines, END_SENTINEL);

  if (startIndexes.length === 0 && endIndexes.length === 0) {
    return {
      contentWithoutComments: markdown,
      comments: [],
      errors: []
    };
  }

  const errors: string[] = [];
  if (startIndexes.length !== 1 || endIndexes.length !== 1) {
    if (startIndexes.length !== 1) {
      errors.push(`Expected exactly one '${START_SENTINEL}' marker.`);
    }
    if (endIndexes.length !== 1) {
      errors.push(`Expected exactly one '${END_SENTINEL}' marker.`);
    }

    return {
      contentWithoutComments: markdown,
      comments: [],
      errors
    };
  }

  const start = startIndexes[0];
  const end = endIndexes[0];
  if (end <= start) {
    return {
      contentWithoutComments: markdown,
      comments: [],
      errors: [`'${END_SENTINEL}' must appear after '${START_SENTINEL}'.`]
    };
  }

  let removeStart = start;
  if (removeStart > 0 && lines[removeStart - 1].trim().length === 0) {
    removeStart -= 1;
  }

  const keptLines = [...lines.slice(0, removeStart), ...lines.slice(end + 1)];
  while (keptLines.length > 0 && keptLines[keptLines.length - 1].trim().length === 0) {
    keptLines.pop();
  }

  const blockLines = lines.slice(start + 1, end);
  const parsed = parseCommentThreads(blockLines, start + 2);

  return {
    contentWithoutComments: keptLines.join(lineEnding),
    comments: parsed.comments,
    errors: parsed.errors
  };
}

export function serializeCommentAppendix(comments: StegoCommentThread[], lineEnding = '\n'): string {
  if (comments.length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push(START_SENTINEL);
  lines.push('');

  for (const comment of comments) {
    lines.push(`<!-- comment: ${comment.id} -->`);
    lines.push(`<!-- meta64: ${encodeCommentMeta64(comment)} -->`);
    const entry = comment.thread[0] ?? '';
    const parsed = parseThreadEntry(entry);
    const headerTimestamp = escapeThreadHeaderPart(parsed.timestamp || 'Unknown time');
    const headerAuthor = escapeThreadHeaderPart(parsed.author || 'Unknown');
    lines.push(`> _${headerTimestamp} | ${headerAuthor}_`);
    lines.push('>');
    const messageLines = parsed.message ? parsed.message.split(/\r?\n/) : ['(No message)'];
    for (const messageLine of messageLines) {
      lines.push(`> ${messageLine}`);
    }
    lines.push('');
  }

  lines.push(END_SENTINEL);
  return lines.join(lineEnding);
}

export function upsertCommentAppendix(contentWithoutComments: string, comments: StegoCommentThread[], lineEnding = '\n'): string {
  const appendix = serializeCommentAppendix(comments, lineEnding);
  if (!appendix) {
    return contentWithoutComments;
  }

  const trimmed = contentWithoutComments.replace(/\s*$/, '');
  return `${trimmed}${lineEnding}${lineEnding}${appendix}${lineEnding}`;
}

function parseCommentThreads(lines: string[], baseLineNumber: number): { comments: StegoCommentThread[]; errors: string[] } {
  const comments: StegoCommentThread[] = [];
  const errors: string[] = [];

  let index = 0;
  while (index < lines.length) {
    const trimmed = lines[index].trim();
    if (!trimmed) {
      index += 1;
      continue;
    }

    const heading = trimmed.match(/^<!--\s*comment:\s*(CMT-\d{4})\s*-->$/);
    if (!heading) {
      errors.push(`Line ${baseLineNumber + index}: Expected comment delimiter '<!-- comment: CMT-0001 -->'.`);
      index += 1;
      continue;
    }

    const threadId = heading[1];
    index += 1;

    const rows: string[] = [];
    const rowLineNumbers: number[] = [];
    while (index < lines.length) {
      const rowTrimmed = lines[index].trim();
      if (/^<!--\s*comment:\s*CMT-\d{4}\s*-->$/.test(rowTrimmed)) {
        break;
      }
      rows.push(lines[index]);
      rowLineNumbers.push(baseLineNumber + index);
      index += 1;
    }

    const parsed = parseSingleThread(threadId, rows, rowLineNumbers);
    comments.push(parsed.comment);
    errors.push(...parsed.errors);
  }

  return { comments, errors };
}

function parseSingleThread(id: string, rows: string[], rowLineNumbers: number[]): { comment: StegoCommentThread; errors: string[] } {
  let status: StegoCommentStatus = 'open';
  let anchor: StegoCommentAnchorType = 'file';
  const thread: string[] = [];
  const errors: string[] = [];
  let paragraphIndex: number | undefined;
  let signature: string | undefined;
  let excerpt: string | undefined;
  let excerptStartLine: number | undefined;
  let excerptStartCol: number | undefined;
  let excerptEndLine: number | undefined;
  let excerptEndCol: number | undefined;
  let sawMeta64 = false;
  let rowIndex = 0;
  while (rowIndex < rows.length) {
    const raw = rows[rowIndex];
    const lineNumber = rowLineNumbers[rowIndex] ?? 0;
    const trimmed = raw.trim();
    if (!trimmed) {
      rowIndex += 1;
      continue;
    }

    if (thread.length > 0) {
      errors.push(`Line ${lineNumber}: Multiple message blocks found for ${id}. Create a new CMT id for each reply.`);
      break;
    }

    if (!sawMeta64) {
      const metaMatch = trimmed.match(/^<!--\s*meta64:\s*(\S+)\s*-->\s*$/);
      if (!metaMatch) {
        errors.push(`Line ${lineNumber}: Invalid comment metadata row '${trimmed}'. Expected '<!-- meta64: <base64url-json> -->'.`);
        rowIndex += 1;
        continue;
      }

      sawMeta64 = true;
      const decoded = decodeCommentMeta64(metaMatch[1], id, lineNumber, errors);
      if (decoded) {
        status = decoded.status;
        anchor = decoded.anchor;
        paragraphIndex = decoded.paragraphIndex;
        signature = decoded.signature;
        excerpt = decoded.excerpt;
        excerptStartLine = decoded.excerptStartLine;
        excerptStartCol = decoded.excerptStartCol;
        excerptEndLine = decoded.excerptEndLine;
        excerptEndCol = decoded.excerptEndCol;
      }
      rowIndex += 1;
      continue;
    }

    const headerQuote = extractQuotedLine(raw);
    if (headerQuote === undefined) {
      errors.push(`Line ${lineNumber}: Invalid thread header '${trimmed}'. Expected blockquote header like '> _timestamp | author_'.`);
      rowIndex += 1;
      continue;
    }

    const header = parseThreadHeader(headerQuote);
    if (!header) {
      errors.push(`Line ${lineNumber}: Invalid thread header '${headerQuote.trim()}'. Expected '> _timestamp | author_'.`);
      rowIndex += 1;
      continue;
    }

    rowIndex += 1;
    while (rowIndex < rows.length) {
      const separatorRaw = rows[rowIndex];
      const separatorTrimmed = separatorRaw.trim();
      if (!separatorTrimmed) {
        rowIndex += 1;
        continue;
      }

      const separatorQuote = extractQuotedLine(separatorRaw);
      if (separatorQuote !== undefined && separatorQuote.trim().length === 0) {
        rowIndex += 1;
      }
      break;
    }

    const messageLines: string[] = [];
    while (rowIndex < rows.length) {
      const messageRaw = rows[rowIndex];
      const messageLineNumber = rowLineNumbers[rowIndex] ?? lineNumber;
      const messageTrimmed = messageRaw.trim();
      if (!messageTrimmed) {
        rowIndex += 1;
        if (messageLines.length > 0) {
          break;
        }
        continue;
      }

      const messageQuote = extractQuotedLine(messageRaw);
      if (messageQuote === undefined) {
        errors.push(`Line ${messageLineNumber}: Invalid thread line '${messageTrimmed}'. Expected blockquote content starting with '>'.`);
        rowIndex += 1;
        if (messageLines.length > 0) {
          break;
        }
        continue;
      }

      if (parseThreadHeader(messageQuote)) {
        break;
      }

      messageLines.push(messageQuote);
      rowIndex += 1;
    }

    while (messageLines.length > 0 && messageLines[messageLines.length - 1].trim().length === 0) {
      messageLines.pop();
    }

    if (messageLines.length === 0) {
      errors.push(`Line ${lineNumber}: Thread entry for ${id} is missing message text.`);
      continue;
    }

    const message = messageLines.join('\n').trim();
    thread.push(`${header.timestamp} | ${header.author} | ${message}`);
  }

  if (!sawMeta64) {
    errors.push(`Comment ${id}: Missing metadata row ('<!-- meta64: <base64url-json> -->').`);
  }

  if (thread.length === 0) {
    errors.push(`Comment ${id}: Missing valid blockquote thread entries.`);
  }

  const comment: StegoCommentThread = {
    id,
    status,
    anchor,
    paragraphIndex,
    signature,
    excerpt,
    excerptStartLine,
    excerptStartCol,
    excerptEndLine,
    excerptEndCol,
    thread
  };

  return {
    comment,
    errors
  };
}

function parseOptionalInteger(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 0 ? value : undefined;
  }

  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) {
    return undefined;
  }

  return Number(value.trim());
}

function encodeCommentMeta64(comment: StegoCommentThread): string {
  const payload: Record<string, string | number> = {
    status: comment.status,
    anchor: comment.anchor
  };

  if (comment.anchor === 'paragraph') {
    if (comment.paragraphIndex !== undefined) {
      payload.paragraph_index = comment.paragraphIndex;
    }
    if (comment.signature) {
      payload.signature = comment.signature;
    }
  }

  if (comment.excerpt) {
    payload.excerpt = comment.excerpt;
  }

  if (comment.excerptStartLine !== undefined) {
    payload.excerpt_start_line = comment.excerptStartLine;
  }
  if (comment.excerptStartCol !== undefined) {
    payload.excerpt_start_col = comment.excerptStartCol;
  }
  if (comment.excerptEndLine !== undefined) {
    payload.excerpt_end_line = comment.excerptEndLine;
  }
  if (comment.excerptEndCol !== undefined) {
    payload.excerpt_end_col = comment.excerptEndCol;
  }

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCommentMeta64(
  encoded: string,
  commentId: string,
  lineNumber: number,
  errors: string[]
): {
  status: StegoCommentStatus;
  anchor: StegoCommentAnchorType;
  paragraphIndex?: number;
  signature?: string;
  excerpt?: string;
  excerptStartLine?: number;
  excerptStartCol?: number;
  excerptEndLine?: number;
  excerptEndCol?: number;
} | undefined {
  let rawJson = '';
  try {
    rawJson = Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    errors.push(`Line ${lineNumber}: Invalid meta64 payload for ${commentId}; expected base64url-encoded JSON.`);
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    errors.push(`Line ${lineNumber}: Invalid meta64 JSON for ${commentId}.`);
    return undefined;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    errors.push(`Line ${lineNumber}: Invalid meta64 object for ${commentId}.`);
    return undefined;
  }

  const record = parsed as Record<string, unknown>;
  const allowedKeys = new Set(['status', 'anchor', 'paragraph_index', 'signature', 'excerpt', 'excerpt_start_line', 'excerpt_start_col', 'excerpt_end_line', 'excerpt_end_col']);
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      errors.push(`Line ${lineNumber}: meta64 for ${commentId} contains unsupported key '${key}'.`);
      return undefined;
    }
  }

  const status = record.status === 'open' || record.status === 'resolved'
    ? record.status
    : undefined;
  if (!status) {
    errors.push(`Line ${lineNumber}: meta64 for ${commentId} is missing valid 'status' ('open' or 'resolved').`);
    return undefined;
  }

  const anchor = record.anchor === 'paragraph' || record.anchor === 'file'
    ? record.anchor
    : undefined;
  if (!anchor) {
    errors.push(`Line ${lineNumber}: meta64 for ${commentId} is missing valid 'anchor' ('paragraph' or 'file').`);
    return undefined;
  }

  return {
    status,
    anchor,
    paragraphIndex: parseOptionalInteger(record.paragraph_index),
    signature: typeof record.signature === 'string' ? record.signature : undefined,
    excerpt: typeof record.excerpt === 'string' ? record.excerpt : undefined,
    excerptStartLine: parseOptionalInteger(record.excerpt_start_line),
    excerptStartCol: parseOptionalInteger(record.excerpt_start_col),
    excerptEndLine: parseOptionalInteger(record.excerpt_end_line),
    excerptEndCol: parseOptionalInteger(record.excerpt_end_col)
  };
}

function parseThreadEntry(entry: string): { timestamp: string; author: string; message: string } {
  const firstPipe = entry.indexOf('|');
  if (firstPipe < 0) {
    return {
      timestamp: '',
      author: 'Unknown',
      message: entry.trim()
    };
  }

  const secondPipe = entry.indexOf('|', firstPipe + 1);
  if (secondPipe < 0) {
    return {
      timestamp: entry.slice(0, firstPipe).trim(),
      author: 'Unknown',
      message: entry.slice(firstPipe + 1).trim()
    };
  }

  return {
    timestamp: entry.slice(0, firstPipe).trim(),
    author: entry.slice(firstPipe + 1, secondPipe).trim() || 'Unknown',
    message: entry.slice(secondPipe + 1).trim()
  };
}

function escapeThreadHeaderPart(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/_/g, '\\_');
}

function extractQuotedLine(raw: string): string | undefined {
  const quoteMatch = raw.match(/^\s*>\s?(.*)$/);
  if (!quoteMatch) {
    return undefined;
  }

  return quoteMatch[1];
}

function parseThreadHeader(value: string): { timestamp: string; author: string } | undefined {
  const match = value.trim().match(/^_(.+?)\s*\|\s*(.+?)_\s*$/);
  if (!match) {
    return undefined;
  }

  const timestamp = match[1].trim();
  const author = match[2].trim();
  if (!timestamp || !author) {
    return undefined;
  }

  return { timestamp, author };
}

function indexesOfTrimmedLine(lines: string[], needle: string): number[] {
  const indexes: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim() === needle) {
      indexes.push(i);
    }
  }
  return indexes;
}

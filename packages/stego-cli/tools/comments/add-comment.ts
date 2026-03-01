import fs from "node:fs";
import path from "node:path";
import { CommentsCommandError } from "./errors.ts";

export type CommentRange = {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
};

export type AddCommentRequest = {
  manuscriptPath: string;
  cwd: string;
  message: string;
  author: string;
  range?: CommentRange;
  sourceMeta?: Record<string, unknown>;
};

export type AddCommentResult = {
  ok: true;
  manuscript: string;
  commentId: string;
  status: "open";
  anchor: {
    type: "file" | "selection";
    excerptStartLine?: number;
    excerptStartCol?: number;
    excerptEndLine?: number;
    excerptEndCol?: number;
  };
  createdAt: string;
};

const COMMENT_DELIMITER_REGEX = /^<!--\s*comment:\s*(CMT-(\d{4,}))\s*-->\s*$/i;
const LEGACY_COMMENT_HEADING_REGEX = /^###\s+(CMT-(\d{4,}))\s*$/i;
const START_SENTINEL = "<!-- stego-comments:start -->";
const END_SENTINEL = "<!-- stego-comments:end -->";

/** Adds one stego comment entry to a manuscript and writes the updated file. */
export function addCommentToManuscript(request: AddCommentRequest): AddCommentResult {
  const absolutePath = path.resolve(request.cwd, request.manuscriptPath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    throw new CommentsCommandError("INVALID_USAGE", 2, `Manuscript file not found: ${request.manuscriptPath}`);
  }

  const raw = fs.readFileSync(absolutePath, "utf8");
  const lineEnding = raw.includes("\r\n") ? "\r\n" : "\n";
  const lines = raw.split(/\r?\n/);

  const sentinelState = resolveSentinelState(lines);
  const hasYamlFrontmatter = raw.startsWith(`---${lineEnding}`) || raw.startsWith("---\n");
  if (!sentinelState.hasSentinels && !hasYamlFrontmatter) {
    throw new CommentsCommandError(
      "NOT_STEGO_MANUSCRIPT",
      3,
      "File is not recognized as a Stego manuscript (missing frontmatter and comments sentinels)."
    );
  }

  const commentId = getNextCommentId(lines, sentinelState);
  const now = new Date();
  const createdAt = now.toISOString();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  const timezoneOffsetMinutes = -now.getTimezoneOffset();
  const paragraphIndex = request.range
    ? resolveParagraphIndex(lines, lineEnding, sentinelState, request.range)
    : undefined;
  const excerpt = request.range
    ? extractExcerptForRange(lines, request.range)
    : undefined;
  const meta = buildMetaPayload({
    createdAt,
    timezone,
    timezoneOffsetMinutes,
    paragraphIndex,
    range: request.range,
    sourceMeta: request.sourceMeta
  });
  const meta64 = Buffer.from(JSON.stringify(meta), "utf8").toString("base64url");
  const entryLines = buildCommentEntryLines({
    commentId,
    createdAt,
    author: request.author,
    message: request.message,
    meta64,
    paragraphIndex,
    excerpt
  });
  const nextLines = applyCommentEntry(lines, sentinelState, entryLines);
  const nextContent = `${nextLines.join(lineEnding)}${lineEnding}`;

  try {
    fs.writeFileSync(absolutePath, nextContent, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CommentsCommandError("WRITE_FAILURE", 6, `Failed to update manuscript: ${message}`);
  }

  const result: AddCommentResult = {
    ok: true,
    manuscript: absolutePath,
    commentId,
    status: "open",
    anchor: request.range
      ? {
        type: "selection",
        excerptStartLine: request.range.startLine,
        excerptStartCol: request.range.startCol,
        excerptEndLine: request.range.endLine,
        excerptEndCol: request.range.endCol
      }
      : { type: "file" },
    createdAt
  };

  return result;
}

function buildMetaPayload(input: {
  createdAt: string;
  timezone?: string;
  timezoneOffsetMinutes: number;
  paragraphIndex?: number;
  range?: CommentRange;
  sourceMeta?: Record<string, unknown>;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    status: "open",
    created_at: input.createdAt,
    timezone_offset_minutes: input.timezoneOffsetMinutes
  };

  if (input.timezone) {
    payload.timezone = input.timezone;
  }

  if (input.paragraphIndex !== undefined) {
    payload.paragraph_index = input.paragraphIndex;
  }

  if (input.range) {
    payload.excerpt_start_line = input.range.startLine;
    payload.excerpt_start_col = input.range.startCol;
    payload.excerpt_end_line = input.range.endLine;
    payload.excerpt_end_col = input.range.endCol;
  }

  if (input.sourceMeta && Object.keys(input.sourceMeta).length > 0) {
    payload.signature = input.sourceMeta;
  }

  return payload;
}

function buildCommentEntryLines(input: {
  commentId: string;
  createdAt: string;
  author: string;
  message: string;
  meta64: string;
  paragraphIndex?: number;
  excerpt?: string;
}): string[] {
  const safeAuthor = input.author.trim() || "Saurus";
  const normalizedMessageLines = input.message
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd());
  const displayTimestamp = formatHumanTimestamp(input.createdAt);
  const headerTimestamp = escapeThreadHeaderPart(displayTimestamp);
  const headerAuthor = escapeThreadHeaderPart(safeAuthor);

  const lines: string[] = [
    `<!-- comment: ${input.commentId} -->`,
    `<!-- meta64: ${input.meta64} -->`,
    `> _${headerTimestamp} — ${headerAuthor}_`,
    ">"
  ];

  if (input.paragraphIndex !== undefined && input.excerpt) {
    const truncatedExcerpt = input.excerpt.length > 100
      ? `${input.excerpt.slice(0, 100).trimEnd()}…`
      : input.excerpt;
    lines.push(`> > “${truncatedExcerpt}”`);
    lines.push(">");
  }

  lines.push(...normalizedMessageLines.map((line) => `> ${line}`));
  return lines;
}

function applyCommentEntry(
  lines: string[],
  sentinelState: SentinelState,
  entryLines: string[]
): string[] {
  if (!sentinelState.hasSentinels) {
    const baseLines = trimTrailingBlankLines(lines);
    return [
      ...baseLines,
      "",
      START_SENTINEL,
      "",
      ...entryLines,
      "",
      END_SENTINEL
    ];
  }

  const startIndex = sentinelState.startIndex;
  const endIndex = sentinelState.endIndex;
  const block = lines.slice(startIndex + 1, endIndex);
  const trimmedBlock = trimOuterBlankLines(block);
  const nextBlock = trimmedBlock.length > 0
    ? [...trimmedBlock, "", ...entryLines]
    : [...entryLines];

  return [
    ...lines.slice(0, startIndex + 1),
    ...nextBlock,
    ...lines.slice(endIndex)
  ];
}

type SentinelState = {
  hasSentinels: boolean;
  startIndex: number;
  endIndex: number;
};

type ParagraphInfo = {
  index: number;
  startLine: number;
  endLine: number;
  text: string;
};

function resolveSentinelState(lines: string[]): SentinelState {
  const startIndexes = findTrimmedLineIndexes(lines, START_SENTINEL);
  const endIndexes = findTrimmedLineIndexes(lines, END_SENTINEL);
  const hasAnySentinel = startIndexes.length > 0 || endIndexes.length > 0;

  if (!hasAnySentinel) {
    return {
      hasSentinels: false,
      startIndex: -1,
      endIndex: -1
    };
  }

  if (startIndexes.length !== 1 || endIndexes.length !== 1) {
    throw new CommentsCommandError(
      "COMMENT_APPENDIX_INVALID",
      5,
      `Expected exactly one '${START_SENTINEL}' and one '${END_SENTINEL}' marker.`
    );
  }

  const startIndex = startIndexes[0];
  const endIndex = endIndexes[0];
  if (endIndex <= startIndex) {
    throw new CommentsCommandError(
      "COMMENT_APPENDIX_INVALID",
      5,
      `'${END_SENTINEL}' must appear after '${START_SENTINEL}'.`
    );
  }

  return {
    hasSentinels: true,
    startIndex,
    endIndex
  };
}

function findTrimmedLineIndexes(lines: string[], target: string): number[] {
  const indexes: number[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() === target) {
      indexes.push(index);
    }
  }
  return indexes;
}

function getNextCommentId(lines: string[], sentinelState: SentinelState): string {
  const candidateLines = sentinelState.hasSentinels
    ? lines.slice(sentinelState.startIndex + 1, sentinelState.endIndex)
    : lines;

  let maxId = 0;
  for (const line of candidateLines) {
    const trimmed = line.trim();
    const match = trimmed.match(COMMENT_DELIMITER_REGEX) ?? trimmed.match(LEGACY_COMMENT_HEADING_REGEX);
    if (!match || !match[2]) {
      continue;
    }

    const numeric = Number.parseInt(match[2], 10);
    if (Number.isFinite(numeric) && numeric > maxId) {
      maxId = numeric;
    }
  }

  const next = maxId + 1;
  return `CMT-${String(next).padStart(4, "0")}`;
}

function resolveParagraphIndex(
  lines: string[],
  lineEnding: string,
  sentinelState: SentinelState,
  range: CommentRange
): number | undefined {
  const markdownWithoutComments = stripCommentsAppendix(lines, sentinelState, lineEnding);
  const { body, lineOffset } = splitFrontmatterForAnchors(markdownWithoutComments);
  const paragraphs = extractParagraphs(body).map((paragraph) => ({
    ...paragraph,
    startLine: paragraph.startLine + lineOffset,
    endLine: paragraph.endLine + lineOffset
  }));
  const matched = findParagraphForLine(paragraphs, range.startLine) ?? findPreviousParagraphForLine(paragraphs, range.startLine);
  return matched?.index;
}

function extractExcerptForRange(lines: string[], range: CommentRange): string | undefined {
  const startLineIndex = range.startLine - 1;
  const endLineIndex = range.endLine - 1;
  if (startLineIndex < 0 || endLineIndex < 0 || startLineIndex >= lines.length || endLineIndex >= lines.length) {
    return undefined;
  }

  if (startLineIndex > endLineIndex || (startLineIndex === endLineIndex && range.startCol >= range.endCol)) {
    return undefined;
  }

  const startLineText = lines[startLineIndex] ?? "";
  const endLineText = lines[endLineIndex] ?? "";
  const safeStartCol = clamp(range.startCol, 0, startLineText.length);
  const safeEndCol = clamp(range.endCol, 0, endLineText.length);

  let selected = "";
  if (startLineIndex === endLineIndex) {
    if (safeStartCol >= safeEndCol) {
      return undefined;
    }
    selected = startLineText.slice(safeStartCol, safeEndCol);
  } else {
    const segments: string[] = [];
    segments.push(startLineText.slice(safeStartCol));
    for (let lineIndex = startLineIndex + 1; lineIndex < endLineIndex; lineIndex += 1) {
      segments.push(lines[lineIndex] ?? "");
    }
    segments.push(endLineText.slice(0, safeEndCol));
    selected = segments.join("\n");
  }

  const compact = compactExcerpt(selected);
  return compact || undefined;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function compactExcerpt(value: string, max = 180): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= max) {
    return compact;
  }
  return `${compact.slice(0, max - 1)}…`;
}

function stripCommentsAppendix(lines: string[], sentinelState: SentinelState, lineEnding: string): string {
  if (!sentinelState.hasSentinels) {
    return lines.join(lineEnding);
  }

  let removeStart = sentinelState.startIndex;
  if (removeStart > 0 && lines[removeStart - 1].trim().length === 0) {
    removeStart -= 1;
  }

  const keptLines = [...lines.slice(0, removeStart), ...lines.slice(sentinelState.endIndex + 1)];
  while (keptLines.length > 0 && keptLines[keptLines.length - 1].trim().length === 0) {
    keptLines.pop();
  }
  return keptLines.join(lineEnding);
}

function splitFrontmatterForAnchors(markdownText: string): { body: string; lineOffset: number } {
  const frontmatterMatch = markdownText.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!frontmatterMatch) {
    return {
      body: markdownText,
      lineOffset: 0
    };
  }

  const consumed = frontmatterMatch[0];
  return {
    body: markdownText.slice(consumed.length),
    lineOffset: countLineBreaks(consumed)
  };
}

function countLineBreaks(value: string): number {
  const matches = value.match(/\r?\n/g);
  return matches ? matches.length : 0;
}

function extractParagraphs(markdownText: string): ParagraphInfo[] {
  const lines = markdownText.split(/\r?\n/);
  const paragraphs: ParagraphInfo[] = [];
  let currentStart = -1;
  const currentLines: string[] = [];

  const flush = (endIndex: number): void => {
    if (currentStart < 0 || currentLines.length === 0) {
      return;
    }

    const joined = currentLines.join(" ").replace(/\s+/g, " ").trim();
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

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed) {
      flush(index - 1);
      continue;
    }

    if (currentStart < 0) {
      currentStart = index;
    }
    currentLines.push(trimmed);
  }

  flush(lines.length - 1);
  return paragraphs;
}

function findParagraphForLine(paragraphs: ParagraphInfo[], lineNumber: number): ParagraphInfo | undefined {
  return paragraphs.find((paragraph) => lineNumber >= paragraph.startLine && lineNumber <= paragraph.endLine);
}

function findPreviousParagraphForLine(paragraphs: ParagraphInfo[], lineNumber: number): ParagraphInfo | undefined {
  for (let index = paragraphs.length - 1; index >= 0; index -= 1) {
    if (paragraphs[index].endLine < lineNumber) {
      return paragraphs[index];
    }
  }
  return undefined;
}

function formatHumanTimestamp(raw: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    return raw;
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[date.getUTCMonth()];
  const day = date.getUTCDate();
  const year = date.getUTCFullYear();
  const hours24 = date.getUTCHours();
  const hours = hours24 % 12 || 12;
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const ampm = hours24 < 12 ? "AM" : "PM";
  return `${month} ${day}, ${year}, ${hours}:${minutes} ${ampm}`;
}

function escapeThreadHeaderPart(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/_/g, "\\_");
}

function trimTrailingBlankLines(lines: string[]): string[] {
  const copy = [...lines];
  while (copy.length > 0 && copy[copy.length - 1].trim().length === 0) {
    copy.pop();
  }
  return copy;
}

function trimOuterBlankLines(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim().length === 0) {
    start += 1;
  }
  while (end > start && lines[end - 1].trim().length === 0) {
    end -= 1;
  }
  return lines.slice(start, end);
}

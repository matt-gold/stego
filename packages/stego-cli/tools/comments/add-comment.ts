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
  const createdAt = new Date().toISOString();
  const meta = buildMetaPayload(request.range, request.sourceMeta);
  const meta64 = Buffer.from(JSON.stringify(meta), "utf8").toString("base64url");
  const entryLines = buildCommentEntryLines(commentId, createdAt, request.author, request.message, meta64);
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

function buildMetaPayload(range: CommentRange | undefined, sourceMeta: Record<string, unknown> | undefined): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    status: "open"
  };

  if (range) {
    payload.anchor = "selection";
    payload.excerpt = {
      start_line: range.startLine,
      start_col: range.startCol,
      end_line: range.endLine,
      end_col: range.endCol
    };
  }

  if (sourceMeta && Object.keys(sourceMeta).length > 0) {
    payload.signature = sourceMeta;
  }

  return payload;
}

function buildCommentEntryLines(
  commentId: string,
  timestamp: string,
  author: string,
  message: string,
  meta64: string
): string[] {
  const safeAuthor = author.trim() || "Saurus";
  const normalizedMessageLines = message
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd());

  return [
    `<!-- comment: ${commentId} -->`,
    `<!-- meta64: ${meta64} -->`,
    `> _${timestamp} | ${safeAuthor}_`,
    ">",
    ...normalizedMessageLines.map((line) => `> ${line}`)
  ];
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

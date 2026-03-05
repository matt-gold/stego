import process from "node:process";

export const START_SENTINEL = "<!-- stego-comments:start -->";
export const END_SENTINEL = "<!-- stego-comments:end -->";

export type CommentStatus = "open" | "resolved";

export type CommentRange = {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
};

export type CommentThread = {
  id: string;
  status: CommentStatus;
  createdAt?: string;
  timezone?: string;
  timezoneOffsetMinutes?: number;
  paragraphIndex?: number;
  excerpt?: string;
  excerptStartLine?: number;
  excerptStartCol?: number;
  excerptEndLine?: number;
  excerptEndCol?: number;
  thread: string[];
};

export type ParagraphInfo = {
  index: number;
  startLine: number;
  endLine: number;
  text: string;
};

export type CommentAnchor = {
  anchorType: "paragraph" | "file";
  line: number;
  degraded: boolean;
  underlineStartLine?: number;
  underlineStartCol?: number;
  underlineEndLine?: number;
  underlineEndCol?: number;
  paragraphEndLine?: number;
};

export type ParsedCommentAppendix = {
  contentWithoutComments: string;
  comments: CommentThread[];
  errors: string[];
};

export type LoadedCommentDocumentState = {
  lineEnding: string;
  contentWithoutComments: string;
  comments: CommentThread[];
  errors: string[];
  paragraphs: ParagraphInfo[];
  anchorsById: Map<string, CommentAnchor>;
};

export type SerializedCommentDocumentState = {
  contentWithoutComments: string;
  comments: CommentThread[];
  parseErrors: string[];
  anchorsById: Record<string, CommentAnchor>;
  totalCount: number;
  unresolvedCount: number;
};

export type AddCommentAnchorInput = {
  range?: CommentRange;
  cursorLine?: number;
  excerpt?: string;
};

export type AddCommentInput = {
  message: string;
  author?: string;
  anchor?: AddCommentAnchorInput;
  meta?: Record<string, unknown>;
};

export type ReplyCommentInput = {
  commentId: string;
  message: string;
  author?: string;
};

export type SetStatusInput = {
  commentId: string;
  status: CommentStatus;
  thread?: boolean;
};

export type SyncAnchorUpdate = {
  id: string;
  start: { line: number; col: number };
  end: { line: number; col: number };
};

export type SyncAnchorsInput = {
  updates?: SyncAnchorUpdate[];
  deleteIds?: string[];
};

export type AddCommentResult = {
  commentId: string;
  comments: CommentThread[];
};

export type ReplyCommentResult = {
  commentId: string;
  comments: CommentThread[];
};

export type SetStatusResult = {
  changedIds: string[];
  comments: CommentThread[];
};

export type DeleteCommentResult = {
  removed: number;
  comments: CommentThread[];
};

export type ClearResolvedResult = {
  removed: number;
  comments: CommentThread[];
};

export type SyncAnchorsResult = {
  updatedCount: number;
  deletedCount: number;
  comments: CommentThread[];
};

export function parseCommentAppendix(markdown: string): ParsedCommentAppendix {
  const lineEnding = markdown.includes("\r\n") ? "\r\n" : "\n";
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

export function serializeCommentAppendix(comments: CommentThread[], lineEnding = "\n"): string {
  if (comments.length === 0) {
    return "";
  }

  const lines: string[] = [];
  lines.push(START_SENTINEL);
  lines.push("");

  for (const comment of comments) {
    lines.push(`<!-- comment: ${comment.id} -->`);
    lines.push(`<!-- meta64: ${encodeCommentMeta64(comment)} -->`);
    const entry = comment.thread[0] ?? "";
    const parsed = parseThreadEntry(entry);
    const displayTimestamp = formatHumanTimestamp(parsed.timestamp || "Unknown time");
    const headerTimestamp = escapeThreadHeaderPart(displayTimestamp);
    const headerAuthor = escapeThreadHeaderPart(parsed.author || "Unknown");
    lines.push(`> _${headerTimestamp} — ${headerAuthor}_`);
    lines.push(">");
    if (comment.paragraphIndex !== undefined && comment.excerpt) {
      const truncated = comment.excerpt.length > 100
        ? comment.excerpt.slice(0, 100).trimEnd() + "…"
        : comment.excerpt;
      lines.push(`> > “${truncated}”`);
      lines.push(">");
    }
    const messageLines = parsed.message ? parsed.message.split(/\r?\n/) : ["(No message)"];
    for (const messageLine of messageLines) {
      lines.push(`> ${messageLine}`);
    }
    lines.push("");
  }

  lines.push(END_SENTINEL);
  return lines.join(lineEnding);
}

export function upsertCommentAppendix(contentWithoutComments: string, comments: CommentThread[], lineEnding = "\n"): string {
  const appendix = serializeCommentAppendix(comments, lineEnding);
  if (!appendix) {
    return contentWithoutComments;
  }

  const trimmed = contentWithoutComments.replace(/\s*$/, "");
  return `${trimmed}${lineEnding}${lineEnding}${appendix}${lineEnding}`;
}

export function loadCommentDocumentState(markdownText: string): LoadedCommentDocumentState {
  const lineEnding = markdownText.includes("\r\n") ? "\r\n" : "\n";
  const parsed = parseCommentAppendix(markdownText);
  const { body, lineOffset } = splitFrontmatterForAnchors(parsed.contentWithoutComments);
  const baseParagraphs = extractParagraphs(body);
  const paragraphs = baseParagraphs.map((paragraph) => ({
    ...paragraph,
    startLine: paragraph.startLine + lineOffset,
    endLine: paragraph.endLine + lineOffset
  }));

  const anchorsById = new Map<string, CommentAnchor>();
  for (const comment of parsed.comments) {
    anchorsById.set(comment.id, resolveCommentAnchor(comment, paragraphs));
  }

  return {
    lineEnding,
    contentWithoutComments: parsed.contentWithoutComments,
    comments: parsed.comments,
    errors: parsed.errors,
    paragraphs,
    anchorsById
  };
}

export function serializeLoadedState(state: LoadedCommentDocumentState): SerializedCommentDocumentState {
  const anchorsById: Record<string, CommentAnchor> = {};
  for (const [id, anchor] of state.anchorsById.entries()) {
    anchorsById[id] = anchor;
  }

  return {
    contentWithoutComments: state.contentWithoutComments,
    comments: state.comments,
    parseErrors: state.errors,
    anchorsById,
    totalCount: state.comments.length,
    unresolvedCount: state.comments.filter((comment) => comment.status === "open").length
  };
}

export function ensureNoParseErrors(state: LoadedCommentDocumentState): void {
  if (state.errors.length === 0) {
    return;
  }

  const first = state.errors[0] ?? "Comment appendix is invalid.";
  throw new Error(first);
}

export function addCommentToState(
  markdownText: string,
  state: LoadedCommentDocumentState,
  input: AddCommentInput
): AddCommentResult {
  const normalizedMessage = input.message.trim();
  if (!normalizedMessage) {
    throw new Error("Comment message cannot be empty.");
  }

  const now = new Date();
  const createdAt = now.toISOString();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  const timezoneOffsetMinutes = -now.getTimezoneOffset();
  const commentId = createNextCommentId(state.comments);
  const normalizedAuthor = normalizeAuthor(input.author ?? "");
  const anchor = input.anchor ?? {};

  const paragraphByRange = anchor.range
    ? findParagraphForLine(state.paragraphs, anchor.range.startLine) ?? findPreviousParagraphForLine(state.paragraphs, anchor.range.startLine)
    : undefined;
  const paragraphByCursor = anchor.cursorLine !== undefined
    ? findParagraphForLine(state.paragraphs, anchor.cursorLine) ?? findPreviousParagraphForLine(state.paragraphs, anchor.cursorLine)
    : undefined;
  const paragraph = paragraphByRange ?? paragraphByCursor;

  const excerptFromRange = anchor.range
    ? extractExcerptFromRange(markdownText, anchor.range)
    : undefined;
  const explicitExcerpt = anchor.excerpt ? compactExcerpt(anchor.excerpt) : undefined;

  const nextComment: CommentThread = paragraph
    ? {
      id: commentId,
      status: "open",
      createdAt,
      timezone,
      timezoneOffsetMinutes,
      paragraphIndex: paragraph.index,
      excerpt: explicitExcerpt ?? excerptFromRange ?? compactExcerpt(paragraph.text),
      ...(anchor.range
        ? {
          excerptStartLine: anchor.range.startLine,
          excerptStartCol: anchor.range.startCol,
          excerptEndLine: anchor.range.endLine,
          excerptEndCol: anchor.range.endCol
        }
        : {}),
      thread: [formatThreadEntry(createdAt, normalizedAuthor, normalizedMessage)]
    }
    : {
      id: commentId,
      status: "open",
      createdAt,
      timezone,
      timezoneOffsetMinutes,
      excerpt: "(File-level comment)",
      thread: [formatThreadEntry(createdAt, normalizedAuthor, normalizedMessage)]
    };

  if (input.meta && Object.keys(input.meta).length > 0) {
    // Preserve source meta under signature when serializing.
    (nextComment as CommentThread & { signature?: Record<string, unknown> }).signature = input.meta;
  }

  return {
    commentId,
    comments: [...state.comments, nextComment]
  };
}

export function replyToCommentInState(
  state: LoadedCommentDocumentState,
  input: ReplyCommentInput
): ReplyCommentResult {
  const normalizedMessage = input.message.trim();
  if (!normalizedMessage) {
    throw new Error("Reply cannot be empty.");
  }

  const normalizedId = input.commentId.trim().toUpperCase();
  const target = state.comments.find((comment) => comment.id.toUpperCase() === normalizedId);
  if (!target) {
    throw new Error(`Comment ${normalizedId} was not found.`);
  }

  const now = new Date();
  const createdAt = now.toISOString();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  const timezoneOffsetMinutes = -now.getTimezoneOffset();
  const normalizedAuthor = normalizeAuthor(input.author ?? "");
  const nextId = createNextCommentId(state.comments);

  const reply: CommentThread = {
    id: nextId,
    status: "open",
    createdAt,
    timezone,
    timezoneOffsetMinutes,
    paragraphIndex: target.paragraphIndex,
    excerpt: target.excerpt,
    excerptStartLine: target.excerptStartLine,
    excerptStartCol: target.excerptStartCol,
    excerptEndLine: target.excerptEndLine,
    excerptEndCol: target.excerptEndCol,
    thread: [formatThreadEntry(createdAt, normalizedAuthor, normalizedMessage)]
  };

  return {
    commentId: nextId,
    comments: [...state.comments, reply]
  };
}

export function setCommentStatusInState(
  state: LoadedCommentDocumentState,
  input: SetStatusInput
): SetStatusResult {
  const normalizedId = input.commentId.trim().toUpperCase();
  const target = state.comments.find((comment) => comment.id.toUpperCase() === normalizedId);
  if (!target) {
    throw new Error(`Comment ${normalizedId} was not found.`);
  }

  const threadKey = getThreadKey(target);
  const changedIds: string[] = [];
  const nextComments = state.comments.map((comment) => {
    const shouldChange = input.thread
      ? getThreadKey(comment) === threadKey
      : comment.id.toUpperCase() === normalizedId;

    if (!shouldChange) {
      return comment;
    }

    changedIds.push(comment.id);
    return {
      ...comment,
      status: input.status
    };
  });

  return {
    changedIds,
    comments: nextComments
  };
}

export function deleteCommentInState(state: LoadedCommentDocumentState, commentId: string): DeleteCommentResult {
  const normalizedId = commentId.trim().toUpperCase();
  const next = state.comments.filter((comment) => comment.id.toUpperCase() !== normalizedId);
  const removed = state.comments.length - next.length;
  if (removed === 0) {
    throw new Error(`Comment ${normalizedId} was not found.`);
  }

  return {
    removed,
    comments: next
  };
}

export function clearResolvedInState(state: LoadedCommentDocumentState): ClearResolvedResult {
  const before = state.comments.length;
  const next = state.comments.filter((comment) => comment.status !== "resolved");
  return {
    removed: before - next.length,
    comments: next
  };
}

export function syncAnchorsInState(
  markdownText: string,
  state: LoadedCommentDocumentState,
  input: SyncAnchorsInput
): SyncAnchorsResult {
  const updatesById = new Map<string, SyncAnchorUpdate>();
  for (const update of input.updates ?? []) {
    updatesById.set(update.id.trim().toUpperCase(), update);
  }

  let updatedCount = 0;
  let nextComments = state.comments.map((comment) => {
    const update = updatesById.get(comment.id.toUpperCase());
    if (!update) {
      return comment;
    }

    const range: CommentRange = {
      startLine: update.start.line,
      startCol: update.start.col,
      endLine: update.end.line,
      endCol: update.end.col
    };

    if (!hasValidRange(range)) {
      return comment;
    }

    const excerpt = extractExcerptFromRange(markdownText, range) ?? comment.excerpt;
    const paragraph = findParagraphForLine(state.paragraphs, range.startLine)
      ?? findPreviousParagraphForLine(state.paragraphs, range.startLine);

    updatedCount += 1;
    return {
      ...comment,
      paragraphIndex: paragraph?.index,
      excerpt,
      excerptStartLine: range.startLine,
      excerptStartCol: range.startCol,
      excerptEndLine: range.endLine,
      excerptEndCol: range.endCol
    };
  });

  const deleteIdSet = new Set((input.deleteIds ?? []).map((id) => id.trim().toUpperCase()).filter((id) => id.length > 0));
  const beforeDelete = nextComments.length;
  if (deleteIdSet.size > 0) {
    nextComments = nextComments.filter((comment) => !deleteIdSet.has(comment.id.toUpperCase()));
  }

  return {
    updatedCount,
    deletedCount: beforeDelete - nextComments.length,
    comments: nextComments
  };
}

export function renderStateDocument(state: LoadedCommentDocumentState, comments: CommentThread[]): string {
  return upsertCommentAppendix(state.contentWithoutComments, comments, state.lineEnding);
}

export function normalizeAuthor(value: string): string {
  const author = value.trim();
  if (author) {
    return author;
  }

  return process.env.GIT_AUTHOR_NAME
    || process.env.USER
    || process.env.USERNAME
    || "Unknown";
}

function parseCommentThreads(lines: string[], baseLineNumber: number): { comments: CommentThread[]; errors: string[] } {
  const comments: CommentThread[] = [];
  const errors: string[] = [];

  let index = 0;
  while (index < lines.length) {
    const trimmed = lines[index].trim();
    if (!trimmed) {
      index += 1;
      continue;
    }

    const heading = trimmed.match(/^<!--\s*comment:\s*(CMT-\d{4,})\s*-->$/);
    if (!heading) {
      errors.push(`Line ${baseLineNumber + index}: Expected comment delimiter '<!-- comment: CMT-0001 -->'.`);
      index += 1;
      continue;
    }

    const threadId = heading[1].toUpperCase();
    index += 1;

    const rows: string[] = [];
    const rowLineNumbers: number[] = [];
    while (index < lines.length) {
      const rowTrimmed = lines[index].trim();
      if (/^<!--\s*comment:\s*CMT-\d{4,}\s*-->$/.test(rowTrimmed)) {
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

function parseSingleThread(id: string, rows: string[], rowLineNumbers: number[]): { comment: CommentThread; errors: string[] } {
  let status: CommentStatus = "open";
  const thread: string[] = [];
  const errors: string[] = [];
  let paragraphIndex: number | undefined;
  let createdAt: string | undefined;
  let timezone: string | undefined;
  let timezoneOffsetMinutes: number | undefined;
  let excerpt: string | undefined;
  let excerptStartLine: number | undefined;
  let excerptStartCol: number | undefined;
  let excerptEndLine: number | undefined;
  let excerptEndCol: number | undefined;
  let signature: Record<string, unknown> | undefined;
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
        createdAt = decoded.createdAt;
        timezone = decoded.timezone;
        timezoneOffsetMinutes = decoded.timezoneOffsetMinutes;
        paragraphIndex = decoded.paragraphIndex;
        excerptStartLine = decoded.excerptStartLine;
        excerptStartCol = decoded.excerptStartCol;
        excerptEndLine = decoded.excerptEndLine;
        excerptEndCol = decoded.excerptEndCol;
        signature = decoded.signature;
      }
      rowIndex += 1;
      continue;
    }

    const headerQuote = extractQuotedLine(raw);
    if (headerQuote === undefined) {
      errors.push(`Line ${lineNumber}: Invalid thread header '${trimmed}'. Expected blockquote header like '> _timestamp — author_'.`);
      rowIndex += 1;
      continue;
    }

    const header = parseThreadHeader(headerQuote);
    if (!header) {
      errors.push(`Line ${lineNumber}: Invalid thread header '${headerQuote.trim()}'. Expected '> _timestamp — author_'.`);
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

    if (rowIndex < rows.length) {
      const nestedMatch = rows[rowIndex].match(/^\s*>\s*>\s*(.*)$/);
      if (nestedMatch) {
        let excerptContent = nestedMatch[1].trim();
        excerptContent = excerptContent.replace(/^[\u201c"]\s*/, "").replace(/\s*[\u201d"]$/, "");
        excerpt = excerptContent;
        rowIndex += 1;

        while (rowIndex < rows.length) {
          const sepRaw = rows[rowIndex];
          const sepTrimmed = sepRaw.trim();
          if (!sepTrimmed) {
            rowIndex += 1;
            continue;
          }

          const sepQuote = extractQuotedLine(sepRaw);
          if (sepQuote !== undefined && sepQuote.trim().length === 0) {
            rowIndex += 1;
          }
          break;
        }
      }
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

    const message = messageLines.join("\n").trim();
    thread.push(`${createdAt || header.timestamp} | ${header.author} | ${message}`);
  }

  if (!sawMeta64) {
    errors.push(`Comment ${id}: Missing metadata row ('<!-- meta64: <base64url-json> -->').`);
  }

  if (thread.length === 0) {
    errors.push(`Comment ${id}: Missing valid blockquote thread entries.`);
  }

  const comment: CommentThread = {
    id,
    status,
    createdAt,
    timezone,
    timezoneOffsetMinutes,
    paragraphIndex,
    excerpt,
    excerptStartLine,
    excerptStartCol,
    excerptEndLine,
    excerptEndCol,
    thread
  };

  if (signature && Object.keys(signature).length > 0) {
    (comment as CommentThread & { signature?: Record<string, unknown> }).signature = signature;
  }

  return {
    comment,
    errors
  };
}

function encodeCommentMeta64(comment: CommentThread): string {
  const payload: Record<string, unknown> = {
    status: comment.status
  };

  if (comment.createdAt) {
    payload.created_at = comment.createdAt;
  }

  if (comment.timezone) {
    payload.timezone = comment.timezone;
  }

  if (comment.timezoneOffsetMinutes !== undefined) {
    payload.timezone_offset_minutes = comment.timezoneOffsetMinutes;
  }

  if (comment.paragraphIndex !== undefined) {
    payload.paragraph_index = comment.paragraphIndex;
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

  const signature = (comment as CommentThread & { signature?: Record<string, unknown> }).signature;
  if (signature && Object.keys(signature).length > 0) {
    payload.signature = signature;
  }

  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCommentMeta64(
  encoded: string,
  commentId: string,
  lineNumber: number,
  errors: string[]
): {
  status: CommentStatus;
  createdAt?: string;
  timezone?: string;
  timezoneOffsetMinutes?: number;
  paragraphIndex?: number;
  excerptStartLine?: number;
  excerptStartCol?: number;
  excerptEndLine?: number;
  excerptEndCol?: number;
  signature?: Record<string, unknown>;
} | undefined {
  let rawJson = "";
  try {
    rawJson = Buffer.from(encoded, "base64url").toString("utf8");
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

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    errors.push(`Line ${lineNumber}: Invalid meta64 object for ${commentId}.`);
    return undefined;
  }

  const record = parsed as Record<string, unknown>;

  const status = record.status === "open" || record.status === "resolved"
    ? record.status
    : undefined;
  if (!status) {
    errors.push(`Line ${lineNumber}: meta64 for ${commentId} is missing valid 'status' ('open' or 'resolved').`);
    return undefined;
  }

  const signature = isPlainObject(record.signature) ? record.signature as Record<string, unknown> : undefined;

  return {
    status,
    createdAt: typeof record.created_at === "string" ? record.created_at : undefined,
    timezone: typeof record.timezone === "string" ? record.timezone : undefined,
    timezoneOffsetMinutes: parseOptionalSignedInteger(record.timezone_offset_minutes),
    paragraphIndex: parseOptionalInteger(record.paragraph_index),
    excerptStartLine: parseOptionalInteger(record.excerpt_start_line),
    excerptStartCol: parseOptionalInteger(record.excerpt_start_col),
    excerptEndLine: parseOptionalInteger(record.excerpt_end_line),
    excerptEndCol: parseOptionalInteger(record.excerpt_end_col),
    signature
  };
}

function parseOptionalInteger(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 0 ? value : undefined;
  }

  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) {
    return undefined;
  }

  return Number(value.trim());
}

function parseOptionalSignedInteger(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? value : undefined;
  }

  if (typeof value !== "string" || !/^-?\d+$/.test(value.trim())) {
    return undefined;
  }

  return Number(value.trim());
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
  const body = markdownText.slice(consumed.length);
  return {
    body,
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

function resolveCommentAnchor(comment: CommentThread, paragraphs: ParagraphInfo[]): CommentAnchor {
  if (comment.paragraphIndex === undefined) {
    return {
      anchorType: "file",
      line: 1,
      degraded: false
    };
  }

  const matched = paragraphs.find((paragraph) => paragraph.index === comment.paragraphIndex);

  if (matched) {
    const anchor: CommentAnchor = {
      anchorType: "paragraph",
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

  for (let index = comment.paragraphIndex - 1; index >= 0; index -= 1) {
    const previous = paragraphs.find((paragraph) => paragraph.index === index);
    if (previous) {
      return {
        anchorType: "paragraph",
        line: previous.startLine,
        degraded: true
      };
    }
  }

  return {
    anchorType: "file",
    line: 1,
    degraded: true
  };
}

function hasValidExcerptRange(comment: {
  excerptStartLine?: number;
  excerptStartCol?: number;
  excerptEndLine?: number;
  excerptEndCol?: number;
}): boolean {
  if (
    comment.excerptStartLine === undefined
    || comment.excerptStartCol === undefined
    || comment.excerptEndLine === undefined
    || comment.excerptEndCol === undefined
  ) {
    return false;
  }

  return comment.excerptStartLine < comment.excerptEndLine
    || (comment.excerptStartLine === comment.excerptEndLine && comment.excerptStartCol < comment.excerptEndCol);
}

function hasValidRange(range: CommentRange): boolean {
  return range.startLine < range.endLine
    || (range.startLine === range.endLine && range.startCol < range.endCol);
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

function parseThreadEntry(entry: string): { timestamp: string; author: string; message: string } {
  const firstPipe = entry.indexOf("|");
  if (firstPipe < 0) {
    return {
      timestamp: "",
      author: "Unknown",
      message: entry.trim()
    };
  }

  const secondPipe = entry.indexOf("|", firstPipe + 1);
  if (secondPipe < 0) {
    return {
      timestamp: entry.slice(0, firstPipe).trim(),
      author: "Unknown",
      message: entry.slice(firstPipe + 1).trim()
    };
  }

  return {
    timestamp: entry.slice(0, firstPipe).trim(),
    author: entry.slice(firstPipe + 1, secondPipe).trim() || "Unknown",
    message: entry.slice(secondPipe + 1).trim()
  };
}

function parseThreadHeader(value: string): { timestamp: string; author: string } | undefined {
  const match = value.trim().match(/^_(.+?)\s*—\s*(.+?)_\s*$/);

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

function extractQuotedLine(raw: string): string | undefined {
  const quoteMatch = raw.match(/^\s*>\s?(.*)$/);
  if (!quoteMatch) {
    return undefined;
  }

  return quoteMatch[1];
}

function formatHumanTimestamp(raw: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    return raw;
  }

  const date = new Date(raw);
  if (isNaN(date.getTime())) {
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

function formatThreadEntry(timestamp: string, author: string, message: string): string {
  return `${timestamp} | ${author} | ${message}`;
}

function compactExcerpt(value: string, max = 180): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= max) {
    return compact;
  }
  return `${compact.slice(0, max - 1)}…`;
}

function extractExcerptFromRange(markdownText: string, range: CommentRange): string | undefined {
  const lines = markdownText.split(/\r?\n/);
  const startLineIndex = range.startLine - 1;
  const endLineIndex = range.endLine - 1;

  if (startLineIndex < 0 || endLineIndex < 0 || startLineIndex >= lines.length || endLineIndex >= lines.length) {
    return undefined;
  }

  if (!hasValidRange(range)) {
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

function createNextCommentId(comments: CommentThread[]): string {
  let max = 0;

  for (const comment of comments) {
    const match = comment.id.match(/^CMT-(\d{4,})$/i);
    if (!match) {
      continue;
    }

    const value = Number(match[1]);
    if (Number.isFinite(value) && value > max) {
      max = value;
    }
  }

  return `CMT-${String(max + 1).padStart(4, "0")}`;
}

function getThreadKey(comment: CommentThread): string {
  const hasExplicitExcerptAnchor = hasValidExcerptRange(comment);
  if (hasExplicitExcerptAnchor) {
    return [
      "excerpt",
      String(comment.paragraphIndex ?? -1),
      String(comment.excerptStartLine),
      String(comment.excerptStartCol),
      String(comment.excerptEndLine),
      String(comment.excerptEndCol)
    ].join(":");
  }

  return comment.paragraphIndex !== undefined
    ? `paragraph:${comment.paragraphIndex}`
    : "file";
}

function indexesOfTrimmedLine(lines: string[], needle: string): number[] {
  const indexes: number[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() === needle) {
      indexes.push(index);
    }
  }
  return indexes;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

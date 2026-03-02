import fs from "node:fs";
import path from "node:path";
import {
  addCommentToState,
  clearResolvedInState,
  deleteCommentInState,
  ensureNoParseErrors,
  loadCommentDocumentState,
  renderStateDocument,
  replyToCommentInState,
  serializeLoadedState,
  setCommentStatusInState,
  syncAnchorsInState,
  type AddCommentAnchorInput,
  type AddCommentInput,
  type CommentRange,
  type CommentStatus,
  type SyncAnchorUpdate,
  type SyncAnchorsInput
} from "./comment-domain.ts";
import { CommentsCommandError } from "./errors.ts";
import type { CommentsOutputFormat } from "./errors.ts";

type RawOptions = {
  _: string[];
  [key: string]: unknown;
};

type InputPayloadRange = {
  start: { line: number; col: number };
  end: { line: number; col: number };
};

type AddInputPayload = {
  message?: unknown;
  author?: unknown;
  range?: unknown;
  anchor?: unknown;
  meta?: unknown;
};

type AddAnchorPayload = {
  range?: unknown;
  cursor_line?: unknown;
  excerpt?: unknown;
};

type ReplyInputPayload = {
  message?: unknown;
  author?: unknown;
};

type SyncInputPayload = {
  updates?: unknown;
  delete_ids?: unknown;
  deleteIds?: unknown;
};

/** Handles `stego comments ...` command group. */
export async function runCommentsCommand(options: RawOptions, cwd: string): Promise<void> {
  const [subcommand, manuscriptArg] = options._;
  if (!subcommand) {
    throw new CommentsCommandError(
      "INVALID_USAGE",
      2,
      "Comments subcommand is required. Use: read, add, reply, set-status, delete, clear-resolved, sync-anchors."
    );
  }

  if (!manuscriptArg) {
    throw new CommentsCommandError(
      "INVALID_USAGE",
      2,
      "Manuscript path is required. Use: stego comments <subcommand> <manuscript> ..."
    );
  }

  const outputFormat = parseOutputFormat(readString(options, "format"));
  const manuscriptPath = path.resolve(cwd, manuscriptArg);
  const raw = readManuscript(manuscriptPath, manuscriptArg);

  let state = loadCommentDocumentState(raw);

  switch (subcommand) {
    case "read": {
      emitSuccess(
        {
          operation: "read",
          manuscript: manuscriptPath,
          state: serializeLoadedState(state)
        },
        outputFormat,
        `Read comments for ${path.relative(cwd, manuscriptPath) || manuscriptPath}.`
      );
      return;
    }
    case "add": {
      ensureMutableState(state, outputFormat);
      const addInput = resolveAddInput(options, cwd, outputFormat);
      const result = runMutation(
        manuscriptPath,
        state,
        outputFormat,
        () => addCommentToState(raw, state, addInput),
        (mutationResult) => mutationResult.comments
      );
      state = result.state;

      emitSuccess(
        {
          operation: "add",
          manuscript: manuscriptPath,
          commentId: result.meta.commentId,
          state: serializeLoadedState(state)
        },
        outputFormat,
        `Added ${result.meta.commentId} to ${path.relative(cwd, manuscriptPath) || manuscriptPath}.`
      );
      return;
    }
    case "reply": {
      ensureMutableState(state, outputFormat);
      const commentId = requireCommentId(options, outputFormat);
      const { message, author } = resolveReplyInput(options, cwd, outputFormat);
      const result = runMutation(
        manuscriptPath,
        state,
        outputFormat,
        () => replyToCommentInState(state, { commentId, message, author }),
        (mutationResult) => mutationResult.comments
      );
      state = result.state;

      emitSuccess(
        {
          operation: "reply",
          manuscript: manuscriptPath,
          commentId: result.meta.commentId,
          state: serializeLoadedState(state)
        },
        outputFormat,
        `Added reply ${result.meta.commentId} in ${path.relative(cwd, manuscriptPath) || manuscriptPath}.`
      );
      return;
    }
    case "set-status": {
      ensureMutableState(state, outputFormat);
      const commentId = requireCommentId(options, outputFormat);
      const status = parseStatus(readString(options, "status"), outputFormat);
      const thread = options.thread === true;
      const result = runMutation(
        manuscriptPath,
        state,
        outputFormat,
        () => setCommentStatusInState(state, { commentId, status, thread }),
        (mutationResult) => mutationResult.comments
      );
      state = result.state;

      emitSuccess(
        {
          operation: "set-status",
          manuscript: manuscriptPath,
          status,
          changedIds: result.meta.changedIds,
          state: serializeLoadedState(state)
        },
        outputFormat,
        `Updated ${result.meta.changedIds.length} comment(s) to '${status}'.`
      );
      return;
    }
    case "delete": {
      ensureMutableState(state, outputFormat);
      const commentId = requireCommentId(options, outputFormat);
      const result = runMutation(
        manuscriptPath,
        state,
        outputFormat,
        () => deleteCommentInState(state, commentId),
        (mutationResult) => mutationResult.comments
      );
      state = result.state;

      emitSuccess(
        {
          operation: "delete",
          manuscript: manuscriptPath,
          removed: result.meta.removed,
          state: serializeLoadedState(state)
        },
        outputFormat,
        `Deleted ${result.meta.removed} comment(s).`
      );
      return;
    }
    case "clear-resolved": {
      ensureMutableState(state, outputFormat);
      const result = runMutation(
        manuscriptPath,
        state,
        outputFormat,
        () => clearResolvedInState(state),
        (mutationResult) => mutationResult.comments
      );
      state = result.state;

      emitSuccess(
        {
          operation: "clear-resolved",
          manuscript: manuscriptPath,
          removed: result.meta.removed,
          state: serializeLoadedState(state)
        },
        outputFormat,
        `Cleared ${result.meta.removed} resolved comment(s).`
      );
      return;
    }
    case "sync-anchors": {
      ensureMutableState(state, outputFormat);
      const payload = readInputPayload(requireInputPath(options, outputFormat), cwd, outputFormat);
      const syncInput = parseSyncInput(payload, outputFormat);
      const result = runMutation(
        manuscriptPath,
        state,
        outputFormat,
        () => syncAnchorsInState(raw, state, syncInput),
        (mutationResult) => mutationResult.comments
      );
      state = result.state;

      emitSuccess(
        {
          operation: "sync-anchors",
          manuscript: manuscriptPath,
          updatedCount: result.meta.updatedCount,
          deletedCount: result.meta.deletedCount,
          state: serializeLoadedState(state)
        },
        outputFormat,
        `Synced anchors (${result.meta.updatedCount} updated, ${result.meta.deletedCount} deleted).`
      );
      return;
    }
    default:
      throw new CommentsCommandError(
        "INVALID_USAGE",
        2,
        `Unknown comments subcommand '${subcommand}'. Use: read, add, reply, set-status, delete, clear-resolved, sync-anchors.`,
        outputFormat
      );
  }
}

function runMutation<T extends Record<string, unknown>>(
  manuscriptPath: string,
  state: ReturnType<typeof loadCommentDocumentState>,
  outputFormat: CommentsOutputFormat,
  run: () => T,
  getComments: (result: T) => ReturnType<typeof loadCommentDocumentState>["comments"]
): { meta: T; state: ReturnType<typeof loadCommentDocumentState> } {
  let mutationResult: T;
  try {
    mutationResult = run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CommentsCommandError("INVALID_PAYLOAD", 4, message, outputFormat);
  }

  const nextComments = getComments(mutationResult);
  const nextText = renderStateDocument(state, nextComments);
  try {
    fs.writeFileSync(manuscriptPath, nextText, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CommentsCommandError("WRITE_FAILURE", 6, `Failed to update manuscript: ${message}`, outputFormat);
  }

  const nextState = loadCommentDocumentState(nextText);
  return {
    meta: mutationResult,
    state: nextState
  };
}

function ensureMutableState(state: ReturnType<typeof loadCommentDocumentState>, outputFormat: CommentsOutputFormat): void {
  try {
    ensureNoParseErrors(state);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CommentsCommandError("COMMENT_APPENDIX_INVALID", 5, message, outputFormat);
  }
}

function readManuscript(absolutePath: string, originalArg: string): string {
  try {
    const stat = fs.statSync(absolutePath);
    if (!stat.isFile()) {
      throw new CommentsCommandError("INVALID_USAGE", 2, `Manuscript file not found: ${originalArg}`);
    }
  } catch {
    throw new CommentsCommandError("INVALID_USAGE", 2, `Manuscript file not found: ${originalArg}`);
  }

  try {
    return fs.readFileSync(absolutePath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CommentsCommandError("INVALID_USAGE", 2, `Unable to read manuscript: ${message}`);
  }
}

function emitSuccess(payload: Record<string, unknown>, outputFormat: CommentsOutputFormat, textMessage: string): void {
  if (outputFormat === "json") {
    console.log(JSON.stringify({ ok: true, ...payload }, null, 2));
    return;
  }

  console.log(textMessage);
}

function readString(options: RawOptions, key: string): string | undefined {
  const value = options[key];
  return typeof value === "string" ? value : undefined;
}

function parseOutputFormat(raw: string | undefined): CommentsOutputFormat {
  if (!raw || raw === "text") {
    return "text";
  }

  if (raw === "json") {
    return "json";
  }

  throw new CommentsCommandError("INVALID_USAGE", 2, "Invalid --format value. Use 'text' or 'json'.");
}

function requireInputPath(options: RawOptions, outputFormat: CommentsOutputFormat): string {
  const value = readString(options, "input");
  if (!value) {
    throw new CommentsCommandError("INVALID_USAGE", 2, "--input <path|-> is required for this command.", outputFormat);
  }
  return value;
}

function readInputPayload(
  inputPath: string,
  cwd: string,
  outputFormat: CommentsOutputFormat
): Record<string, unknown> {
  let rawJson = "";
  try {
    rawJson = inputPath === "-"
      ? fs.readFileSync(0, "utf8")
      : fs.readFileSync(path.resolve(cwd, inputPath), "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CommentsCommandError("INVALID_PAYLOAD", 4, `Unable to read input payload: ${message}`, outputFormat);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new CommentsCommandError("INVALID_PAYLOAD", 4, "Input payload is not valid JSON.", outputFormat);
  }

  if (!isPlainObject(parsed)) {
    throw new CommentsCommandError("INVALID_PAYLOAD", 4, "Input payload must be a JSON object.", outputFormat);
  }

  return parsed;
}

function resolveAddInput(options: RawOptions, cwd: string, outputFormat: CommentsOutputFormat): AddCommentInput {
  const messageOption = readString(options, "message");
  const inputOption = readString(options, "input");

  if (messageOption && inputOption) {
    throw new CommentsCommandError(
      "INVALID_USAGE",
      2,
      "Use exactly one payload mode: --message <text> OR --input <path|->.",
      outputFormat
    );
  }

  if (!messageOption && !inputOption) {
    throw new CommentsCommandError(
      "INVALID_USAGE",
      2,
      "Missing payload. Provide --message <text> or --input <path|->.",
      outputFormat
    );
  }

  const payload = inputOption ? readInputPayload(inputOption, cwd, outputFormat) as AddInputPayload : undefined;
  const payloadMessage = coerceNonEmptyString(payload?.message, "Input payload 'message' must be a non-empty string.", outputFormat);
  const payloadAuthor = coerceOptionalString(payload?.author, "Input payload 'author' must be a string if provided.", outputFormat);
  const payloadMeta = payload?.meta !== undefined
    ? coerceOptionalObject(payload.meta, "Input payload 'meta' must be an object if provided.", outputFormat)
    : undefined;

  const optionRange = parseRangeFromOptions(options, outputFormat);
  const optionCursorLine = parseCursorLineOption(readString(options, "cursor-line"), outputFormat);

  const payloadRange = payload?.range !== undefined
    ? parsePayloadRange(payload.range, outputFormat)
    : undefined;

  const payloadAnchor = payload?.anchor !== undefined
    ? parseAnchorPayload(payload.anchor, outputFormat)
    : undefined;

  const finalMessage = (messageOption ?? payloadMessage ?? "").trim();
  if (!finalMessage) {
    throw new CommentsCommandError(
      "INVALID_PAYLOAD",
      4,
      "Comment message cannot be empty.",
      outputFormat
    );
  }

  const finalAuthor = (readString(options, "author") ?? payloadAuthor ?? "Saurus").trim() || "Saurus";

  const anchor: AddCommentAnchorInput = {
    range: optionRange ?? payloadAnchor?.range ?? payloadRange,
    cursorLine: optionCursorLine ?? payloadAnchor?.cursorLine,
    excerpt: payloadAnchor?.excerpt
  };

  const resolvedAnchor = anchor.range || anchor.cursorLine !== undefined || anchor.excerpt
    ? anchor
    : undefined;

  return {
    message: finalMessage,
    author: finalAuthor,
    anchor: resolvedAnchor,
    meta: payloadMeta
  };
}

function resolveReplyInput(options: RawOptions, cwd: string, outputFormat: CommentsOutputFormat): { message: string; author: string } {
  const messageOption = readString(options, "message");
  const inputOption = readString(options, "input");

  if (messageOption && inputOption) {
    throw new CommentsCommandError(
      "INVALID_USAGE",
      2,
      "Use exactly one payload mode: --message <text> OR --input <path|->.",
      outputFormat
    );
  }

  if (!messageOption && !inputOption) {
    throw new CommentsCommandError(
      "INVALID_USAGE",
      2,
      "Missing payload. Provide --message <text> or --input <path|->.",
      outputFormat
    );
  }

  const payload = inputOption ? readInputPayload(inputOption, cwd, outputFormat) as ReplyInputPayload : undefined;
  const payloadMessage = coerceNonEmptyString(payload?.message, "Input payload 'message' must be a non-empty string.", outputFormat);
  const payloadAuthor = coerceOptionalString(payload?.author, "Input payload 'author' must be a string if provided.", outputFormat);

  const finalMessage = (messageOption ?? payloadMessage ?? "").trim();
  if (!finalMessage) {
    throw new CommentsCommandError("INVALID_PAYLOAD", 4, "Reply cannot be empty.", outputFormat);
  }

  const finalAuthor = (readString(options, "author") ?? payloadAuthor ?? "Saurus").trim() || "Saurus";
  return {
    message: finalMessage,
    author: finalAuthor
  };
}

function parseSyncInput(payload: Record<string, unknown>, outputFormat: CommentsOutputFormat): SyncAnchorsInput {
  const candidate = payload as SyncInputPayload;
  const updates = candidate.updates === undefined
    ? []
    : parseAnchorUpdates(candidate.updates, outputFormat);

  const deleteIdsRaw = candidate.delete_ids ?? candidate.deleteIds;
  const deleteIds = deleteIdsRaw === undefined
    ? []
    : parseDeleteIds(deleteIdsRaw, outputFormat);

  return {
    updates,
    deleteIds
  };
}

function parseAnchorUpdates(raw: unknown, outputFormat: CommentsOutputFormat): SyncAnchorUpdate[] {
  if (!Array.isArray(raw)) {
    throw new CommentsCommandError("INVALID_PAYLOAD", 4, "Input payload 'updates' must be an array.", outputFormat);
  }

  const updates: SyncAnchorUpdate[] = [];
  for (const candidate of raw) {
    if (!isPlainObject(candidate)) {
      throw new CommentsCommandError("INVALID_PAYLOAD", 4, "Each update must be an object.", outputFormat);
    }

    const id = typeof candidate.id === "string" ? candidate.id.trim().toUpperCase() : "";
    if (!/^CMT-\d{4,}$/.test(id)) {
      throw new CommentsCommandError("INVALID_PAYLOAD", 4, "Each update.id must be a comment id like CMT-0001.", outputFormat);
    }

    const start = isPlainObject(candidate.start) ? candidate.start : undefined;
    const end = isPlainObject(candidate.end) ? candidate.end : undefined;
    if (!start || !end) {
      throw new CommentsCommandError("INVALID_PAYLOAD", 4, "Each update must include start and end positions.", outputFormat);
    }

    const parsed: SyncAnchorUpdate = {
      id,
      start: {
        line: parseJsonPositiveInt(start.line, "updates[].start.line", outputFormat),
        col: parseJsonNonNegativeInt(start.col, "updates[].start.col", outputFormat)
      },
      end: {
        line: parseJsonPositiveInt(end.line, "updates[].end.line", outputFormat),
        col: parseJsonNonNegativeInt(end.col, "updates[].end.col", outputFormat)
      }
    };

    const valid = parsed.start.line < parsed.end.line
      || (parsed.start.line === parsed.end.line && parsed.start.col < parsed.end.col);
    if (!valid) {
      throw new CommentsCommandError("INVALID_PAYLOAD", 4, "Each update range end must be after start.", outputFormat);
    }

    updates.push(parsed);
  }

  return updates;
}

function parseDeleteIds(raw: unknown, outputFormat: CommentsOutputFormat): string[] {
  if (!Array.isArray(raw)) {
    throw new CommentsCommandError("INVALID_PAYLOAD", 4, "Input payload 'delete_ids' must be an array.", outputFormat);
  }

  const ids: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string") {
      throw new CommentsCommandError("INVALID_PAYLOAD", 4, "delete_ids values must be strings.", outputFormat);
    }

    const normalized = value.trim().toUpperCase();
    if (!/^CMT-\d{4,}$/.test(normalized)) {
      throw new CommentsCommandError("INVALID_PAYLOAD", 4, `Invalid delete_ids entry '${value}'.`, outputFormat);
    }
    ids.push(normalized);
  }

  return ids;
}

function parseAnchorPayload(raw: unknown, outputFormat: CommentsOutputFormat): AddCommentAnchorInput {
  if (!isPlainObject(raw)) {
    throw new CommentsCommandError("INVALID_PAYLOAD", 4, "Input payload 'anchor' must be an object.", outputFormat);
  }

  const parsed = raw as AddAnchorPayload;
  const range = parsed.range !== undefined
    ? parsePayloadRange(parsed.range, outputFormat)
    : undefined;

  const cursorLine = parsed.cursor_line !== undefined
    ? parseJsonPositiveInt(parsed.cursor_line, "anchor.cursor_line", outputFormat)
    : undefined;

  const excerpt = parsed.excerpt !== undefined
    ? coerceOptionalString(parsed.excerpt, "Input payload 'anchor.excerpt' must be a string if provided.", outputFormat)
    : undefined;

  return {
    range,
    cursorLine,
    excerpt
  };
}

function parseRangeFromOptions(options: RawOptions, outputFormat: CommentsOutputFormat): CommentRange | undefined {
  const rawStartLine = readString(options, "start-line");
  const rawStartCol = readString(options, "start-col");
  const rawEndLine = readString(options, "end-line");
  const rawEndCol = readString(options, "end-col");
  const values = [rawStartLine, rawStartCol, rawEndLine, rawEndCol];
  const hasAny = values.some((value) => value !== undefined);
  const hasAll = values.every((value) => value !== undefined);

  if (!hasAny) {
    return undefined;
  }

  if (!hasAll) {
    throw new CommentsCommandError(
      "INVALID_USAGE",
      2,
      "Range options must include all of --start-line, --start-col, --end-line, --end-col.",
      outputFormat
    );
  }

  const range: CommentRange = {
    startLine: parsePositiveInt(rawStartLine!, "--start-line", outputFormat),
    startCol: parseNonNegativeInt(rawStartCol!, "--start-col", outputFormat),
    endLine: parsePositiveInt(rawEndLine!, "--end-line", outputFormat),
    endCol: parseNonNegativeInt(rawEndCol!, "--end-col", outputFormat)
  };

  validateRange(range, outputFormat);
  return range;
}

function parseCursorLineOption(raw: string | undefined, outputFormat: CommentsOutputFormat): number | undefined {
  if (raw === undefined) {
    return undefined;
  }

  return parsePositiveInt(raw, "--cursor-line", outputFormat);
}

function parsePayloadRange(raw: unknown, outputFormat: CommentsOutputFormat): CommentRange {
  if (!isPlainObject(raw)) {
    throw new CommentsCommandError("INVALID_PAYLOAD", 4, "Input payload range must be an object.", outputFormat);
  }

  const parsed = raw as Record<string, unknown>;
  const start = parsed.start;
  const end = parsed.end;
  if (!isPlainObject(start) || !isPlainObject(end)) {
    throw new CommentsCommandError(
      "INVALID_PAYLOAD",
      4,
      "Input payload range must include start and end objects.",
      outputFormat
    );
  }

  const range: CommentRange = {
    startLine: parseJsonPositiveInt(start.line, "range.start.line", outputFormat),
    startCol: parseJsonNonNegativeInt(start.col, "range.start.col", outputFormat),
    endLine: parseJsonPositiveInt(end.line, "range.end.line", outputFormat),
    endCol: parseJsonNonNegativeInt(end.col, "range.end.col", outputFormat)
  };

  validateRange(range, outputFormat);
  return range;
}

function requireCommentId(options: RawOptions, outputFormat: CommentsOutputFormat): string {
  const commentId = readString(options, "comment-id")?.trim().toUpperCase();
  if (!commentId || !/^CMT-\d{4,}$/.test(commentId)) {
    throw new CommentsCommandError(
      "INVALID_USAGE",
      2,
      "--comment-id CMT-#### is required.",
      outputFormat
    );
  }
  return commentId;
}

function parseStatus(raw: string | undefined, outputFormat: CommentsOutputFormat): CommentStatus {
  const normalized = (raw ?? "").trim().toLowerCase();
  if (normalized === "open" || normalized === "resolved") {
    return normalized;
  }

  throw new CommentsCommandError("INVALID_USAGE", 2, "--status must be 'open' or 'resolved'.", outputFormat);
}

function validateRange(range: CommentRange, outputFormat: CommentsOutputFormat): void {
  const startsBeforeEnd = range.startLine < range.endLine
    || (range.startLine === range.endLine && range.startCol < range.endCol);

  if (!startsBeforeEnd) {
    throw new CommentsCommandError(
      "INVALID_PAYLOAD",
      4,
      "Range end must be after range start.",
      outputFormat
    );
  }
}

function parsePositiveInt(raw: string, label: string, outputFormat: CommentsOutputFormat): number {
  if (!/^\d+$/.test(raw)) {
    throw new CommentsCommandError("INVALID_USAGE", 2, `${label} must be a positive integer.`, outputFormat);
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1) {
    throw new CommentsCommandError("INVALID_USAGE", 2, `${label} must be a positive integer.`, outputFormat);
  }

  return value;
}

function parseNonNegativeInt(raw: string, label: string, outputFormat: CommentsOutputFormat): number {
  if (!/^\d+$/.test(raw)) {
    throw new CommentsCommandError("INVALID_USAGE", 2, `${label} must be a non-negative integer.`, outputFormat);
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 0) {
    throw new CommentsCommandError("INVALID_USAGE", 2, `${label} must be a non-negative integer.`, outputFormat);
  }

  return value;
}

function parseJsonPositiveInt(raw: unknown, label: string, outputFormat: CommentsOutputFormat): number {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1) {
    throw new CommentsCommandError("INVALID_PAYLOAD", 4, `${label} must be a positive integer.`, outputFormat);
  }

  return raw;
}

function parseJsonNonNegativeInt(raw: unknown, label: string, outputFormat: CommentsOutputFormat): number {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0) {
    throw new CommentsCommandError("INVALID_PAYLOAD", 4, `${label} must be a non-negative integer.`, outputFormat);
  }

  return raw;
}

function coerceNonEmptyString(
  value: unknown,
  message: string,
  outputFormat: CommentsOutputFormat
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new CommentsCommandError("INVALID_PAYLOAD", 4, message, outputFormat);
  }

  return value;
}

function coerceOptionalString(
  value: unknown,
  message: string,
  outputFormat: CommentsOutputFormat
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new CommentsCommandError("INVALID_PAYLOAD", 4, message, outputFormat);
  }

  return value;
}

function coerceOptionalObject(
  value: unknown,
  message: string,
  outputFormat: CommentsOutputFormat
): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isPlainObject(value)) {
    throw new CommentsCommandError("INVALID_PAYLOAD", 4, message, outputFormat);
  }

  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

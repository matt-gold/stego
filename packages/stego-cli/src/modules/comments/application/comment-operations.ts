import path from "node:path";
import { CliError } from "@stego/shared/contracts/cli";
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
  type LoadedCommentDocumentState,
  type SyncAnchorUpdate,
  type SyncAnchorsInput
} from "@stego/shared/domain/comments";
import { COMMENT_ID_PATTERN, normalizeCommentId, normalizeCommentStatus } from "../domain/comment-policy.ts";
import {
  readJsonPayload,
  readManuscript,
  resolveManuscriptPath,
  writeManuscript
} from "../infra/comments-repo.ts";
import type { CommentsOperationResult, ExecuteCommentsInput } from "../types.ts";

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

export function executeCommentsOperation(input: ExecuteCommentsInput): CommentsOperationResult {
  const manuscriptPath = resolveManuscriptPath(input.cwd, input.manuscriptArg);
  const raw = readManuscript(manuscriptPath, input.manuscriptArg);
  let state = loadCommentDocumentState(raw);
  const displayPath = path.relative(input.cwd, manuscriptPath) || manuscriptPath;

  switch (input.subcommand) {
    case "read":
      return {
        payload: {
          ok: true,
          operation: "read",
          manuscript: manuscriptPath,
          state: serializeLoadedState(state)
        },
        textMessage: `Read comments for ${displayPath}.`
      };
    case "add": {
      ensureMutableState(state);
      const addInput = resolveAddInput(input.options, input.cwd);
      const result = runMutation(
        manuscriptPath,
        state,
        () => addCommentToState(raw, state, addInput)
      );
      state = result.state;

      return {
        payload: {
          ok: true,
          operation: "add",
          manuscript: manuscriptPath,
          commentId: result.meta.commentId,
          state: serializeLoadedState(state)
        },
        textMessage: `Added ${result.meta.commentId} to ${displayPath}.`
      };
    }
    case "reply": {
      ensureMutableState(state);
      const commentId = requireCommentId(input.options);
      const { message, author } = resolveReplyInput(input.options, input.cwd);
      const result = runMutation(
        manuscriptPath,
        state,
        () => replyToCommentInState(state, { commentId, message, author })
      );
      state = result.state;

      return {
        payload: {
          ok: true,
          operation: "reply",
          manuscript: manuscriptPath,
          commentId: result.meta.commentId,
          state: serializeLoadedState(state)
        },
        textMessage: `Added reply ${result.meta.commentId} in ${displayPath}.`
      };
    }
    case "set-status": {
      ensureMutableState(state);
      const commentId = requireCommentId(input.options);
      const status = parseStatus(readStringOption(input.options, "status"));
      const thread = readBooleanOption(input.options, "thread");
      const result = runMutation(
        manuscriptPath,
        state,
        () => setCommentStatusInState(state, { commentId, status, thread })
      );
      state = result.state;

      return {
        payload: {
          ok: true,
          operation: "set-status",
          manuscript: manuscriptPath,
          status,
          changedIds: result.meta.changedIds,
          state: serializeLoadedState(state)
        },
        textMessage: `Updated ${result.meta.changedIds.length} comment(s) to '${status}'.`
      };
    }
    case "delete": {
      ensureMutableState(state);
      const commentId = requireCommentId(input.options);
      const result = runMutation(
        manuscriptPath,
        state,
        () => deleteCommentInState(state, commentId)
      );
      state = result.state;

      return {
        payload: {
          ok: true,
          operation: "delete",
          manuscript: manuscriptPath,
          removed: result.meta.removed,
          state: serializeLoadedState(state)
        },
        textMessage: `Deleted ${result.meta.removed} comment(s).`
      };
    }
    case "clear-resolved": {
      ensureMutableState(state);
      const result = runMutation(
        manuscriptPath,
        state,
        () => clearResolvedInState(state)
      );
      state = result.state;

      return {
        payload: {
          ok: true,
          operation: "clear-resolved",
          manuscript: manuscriptPath,
          removed: result.meta.removed,
          state: serializeLoadedState(state)
        },
        textMessage: `Cleared ${result.meta.removed} resolved comment(s).`
      };
    }
    case "sync-anchors": {
      ensureMutableState(state);
      const payload = readJsonPayload(requireInputPath(input.options), input.cwd);
      const syncInput = parseSyncInput(payload);
      const result = runMutation(
        manuscriptPath,
        state,
        () => syncAnchorsInState(raw, state, syncInput)
      );
      state = result.state;

      return {
        payload: {
          ok: true,
          operation: "sync-anchors",
          manuscript: manuscriptPath,
          updatedCount: result.meta.updatedCount,
          deletedCount: result.meta.deletedCount,
          state: serializeLoadedState(state)
        },
        textMessage: `Synced anchors (${result.meta.updatedCount} updated, ${result.meta.deletedCount} deleted).`
      };
    }
    default:
      throw new CliError(
        "INVALID_USAGE",
        `Unknown comments subcommand '${input.subcommand}'. Use: read, add, reply, set-status, delete, clear-resolved, sync-anchors.`
      );
  }
}

function runMutation<T extends { comments: LoadedCommentDocumentState["comments"] }>(
  manuscriptPath: string,
  state: LoadedCommentDocumentState,
  run: () => T
): { meta: T; state: LoadedCommentDocumentState } {
  let mutationResult: T;
  try {
    mutationResult = run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CliError("INVALID_PAYLOAD", message);
  }

  const nextText = renderStateDocument(state, mutationResult.comments);
  writeManuscript(manuscriptPath, nextText);
  const nextState = loadCommentDocumentState(nextText);
  return {
    meta: mutationResult,
    state: nextState
  };
}

function ensureMutableState(state: LoadedCommentDocumentState): void {
  try {
    ensureNoParseErrors(state);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CliError("COMMENT_APPENDIX_INVALID", message);
  }
}

function requireInputPath(options: Record<string, unknown>): string {
  const value = readStringOption(options, "input");
  if (!value) {
    throw new CliError("INVALID_USAGE", "--input <path|-> is required for this command.");
  }
  return value;
}

function resolveAddInput(options: Record<string, unknown>, cwd: string): AddCommentInput {
  const messageOption = readStringOption(options, "message");
  const inputOption = readStringOption(options, "input");

  if (messageOption && inputOption) {
    throw new CliError(
      "INVALID_USAGE",
      "Use exactly one payload mode: --message <text> OR --input <path|->."
    );
  }

  if (!messageOption && !inputOption) {
    throw new CliError(
      "INVALID_USAGE",
      "Missing payload. Provide --message <text> or --input <path|->."
    );
  }

  const payload = inputOption ? readJsonPayload(inputOption, cwd) as AddInputPayload : undefined;
  const payloadMessage = coerceNonEmptyString(payload?.message, "Input payload 'message' must be a non-empty string.");
  const payloadAuthor = coerceOptionalString(payload?.author, "Input payload 'author' must be a string if provided.");
  const payloadMeta = payload?.meta !== undefined
    ? coerceOptionalObject(payload.meta, "Input payload 'meta' must be an object if provided.")
    : undefined;

  const optionRange = parseRangeFromOptions(options);
  const optionCursorLine = parseCursorLineOption(readStringOption(options, "cursorLine", "cursor-line"));
  const payloadRange = payload?.range !== undefined
    ? parsePayloadRange(payload.range)
    : undefined;
  const payloadAnchor = payload?.anchor !== undefined
    ? parseAnchorPayload(payload.anchor)
    : undefined;

  const finalMessage = (messageOption ?? payloadMessage ?? "").trim();
  if (!finalMessage) {
    throw new CliError("INVALID_PAYLOAD", "Comment message cannot be empty.");
  }

  const finalAuthor = (readStringOption(options, "author") ?? payloadAuthor ?? "Saurus").trim() || "Saurus";
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

function resolveReplyInput(
  options: Record<string, unknown>,
  cwd: string
): { message: string; author: string } {
  const messageOption = readStringOption(options, "message");
  const inputOption = readStringOption(options, "input");

  if (messageOption && inputOption) {
    throw new CliError(
      "INVALID_USAGE",
      "Use exactly one payload mode: --message <text> OR --input <path|->."
    );
  }

  if (!messageOption && !inputOption) {
    throw new CliError(
      "INVALID_USAGE",
      "Missing payload. Provide --message <text> or --input <path|->."
    );
  }

  const payload = inputOption ? readJsonPayload(inputOption, cwd) as ReplyInputPayload : undefined;
  const payloadMessage = coerceNonEmptyString(payload?.message, "Input payload 'message' must be a non-empty string.");
  const payloadAuthor = coerceOptionalString(payload?.author, "Input payload 'author' must be a string if provided.");

  const finalMessage = (messageOption ?? payloadMessage ?? "").trim();
  if (!finalMessage) {
    throw new CliError("INVALID_PAYLOAD", "Reply cannot be empty.");
  }

  const finalAuthor = (readStringOption(options, "author") ?? payloadAuthor ?? "Saurus").trim() || "Saurus";
  return {
    message: finalMessage,
    author: finalAuthor
  };
}

function parseSyncInput(payload: Record<string, unknown>): SyncAnchorsInput {
  const candidate = payload as SyncInputPayload;
  const updates = candidate.updates === undefined
    ? []
    : parseAnchorUpdates(candidate.updates);

  const deleteIdsRaw = candidate.delete_ids ?? candidate.deleteIds;
  const deleteIds = deleteIdsRaw === undefined
    ? []
    : parseDeleteIds(deleteIdsRaw);

  return {
    updates,
    deleteIds
  };
}

function parseAnchorUpdates(raw: unknown): SyncAnchorUpdate[] {
  if (!Array.isArray(raw)) {
    throw new CliError("INVALID_PAYLOAD", "Input payload 'updates' must be an array.");
  }

  const updates: SyncAnchorUpdate[] = [];
  for (const candidate of raw) {
    if (!isPlainObject(candidate)) {
      throw new CliError("INVALID_PAYLOAD", "Each update must be an object.");
    }

    const id = typeof candidate.id === "string" ? normalizeCommentId(candidate.id) : "";
    if (!COMMENT_ID_PATTERN.test(id)) {
      throw new CliError("INVALID_PAYLOAD", "Each update.id must be a comment id like CMT-0001.");
    }

    const start = isPlainObject(candidate.start) ? candidate.start : undefined;
    const end = isPlainObject(candidate.end) ? candidate.end : undefined;
    if (!start || !end) {
      throw new CliError("INVALID_PAYLOAD", "Each update must include start and end positions.");
    }

    const parsed: SyncAnchorUpdate = {
      id,
      start: {
        line: parseJsonPositiveInt(start.line, "updates[].start.line"),
        col: parseJsonNonNegativeInt(start.col, "updates[].start.col")
      },
      end: {
        line: parseJsonPositiveInt(end.line, "updates[].end.line"),
        col: parseJsonNonNegativeInt(end.col, "updates[].end.col")
      }
    };

    const valid = parsed.start.line < parsed.end.line
      || (parsed.start.line === parsed.end.line && parsed.start.col < parsed.end.col);
    if (!valid) {
      throw new CliError("INVALID_PAYLOAD", "Each update range end must be after start.");
    }

    updates.push(parsed);
  }

  return updates;
}

function parseDeleteIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    throw new CliError("INVALID_PAYLOAD", "Input payload 'delete_ids' must be an array.");
  }

  const ids: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string") {
      throw new CliError("INVALID_PAYLOAD", "delete_ids values must be strings.");
    }

    const normalized = normalizeCommentId(value);
    if (!COMMENT_ID_PATTERN.test(normalized)) {
      throw new CliError("INVALID_PAYLOAD", `Invalid delete_ids entry '${value}'.`);
    }

    ids.push(normalized);
  }

  return ids;
}

function parseAnchorPayload(raw: unknown): AddCommentAnchorInput {
  if (!isPlainObject(raw)) {
    throw new CliError("INVALID_PAYLOAD", "Input payload 'anchor' must be an object.");
  }

  const parsed = raw as AddAnchorPayload;
  const range = parsed.range !== undefined
    ? parsePayloadRange(parsed.range)
    : undefined;

  const cursorLine = parsed.cursor_line !== undefined
    ? parseJsonPositiveInt(parsed.cursor_line, "anchor.cursor_line")
    : undefined;

  const excerpt = parsed.excerpt !== undefined
    ? coerceOptionalString(parsed.excerpt, "Input payload 'anchor.excerpt' must be a string if provided.")
    : undefined;

  return {
    range,
    cursorLine,
    excerpt
  };
}

function parseRangeFromOptions(options: Record<string, unknown>): CommentRange | undefined {
  const rawStartLine = readStringOption(options, "startLine", "start-line");
  const rawStartCol = readStringOption(options, "startCol", "start-col");
  const rawEndLine = readStringOption(options, "endLine", "end-line");
  const rawEndCol = readStringOption(options, "endCol", "end-col");

  const values = [rawStartLine, rawStartCol, rawEndLine, rawEndCol];
  const hasAny = values.some((value) => value !== undefined);
  const hasAll = values.every((value) => value !== undefined);

  if (!hasAny) {
    return undefined;
  }

  if (!hasAll) {
    throw new CliError(
      "INVALID_USAGE",
      "Range options must include all of --start-line, --start-col, --end-line, --end-col."
    );
  }

  const range: CommentRange = {
    startLine: parsePositiveInt(rawStartLine!, "--start-line"),
    startCol: parseNonNegativeInt(rawStartCol!, "--start-col"),
    endLine: parsePositiveInt(rawEndLine!, "--end-line"),
    endCol: parseNonNegativeInt(rawEndCol!, "--end-col")
  };

  validateRange(range);
  return range;
}

function parseCursorLineOption(raw: string | undefined): number | undefined {
  if (raw === undefined) {
    return undefined;
  }

  return parsePositiveInt(raw, "--cursor-line");
}

function parsePayloadRange(raw: unknown): CommentRange {
  if (!isPlainObject(raw)) {
    throw new CliError("INVALID_PAYLOAD", "Input payload range must be an object.");
  }

  const parsed = raw as InputPayloadRange;
  if (!isPlainObject(parsed.start) || !isPlainObject(parsed.end)) {
    throw new CliError("INVALID_PAYLOAD", "Input payload range must include start and end objects.");
  }

  const range: CommentRange = {
    startLine: parseJsonPositiveInt(parsed.start.line, "range.start.line"),
    startCol: parseJsonNonNegativeInt(parsed.start.col, "range.start.col"),
    endLine: parseJsonPositiveInt(parsed.end.line, "range.end.line"),
    endCol: parseJsonNonNegativeInt(parsed.end.col, "range.end.col")
  };

  validateRange(range);
  return range;
}

function requireCommentId(options: Record<string, unknown>): string {
  const commentId = normalizeCommentId(readStringOption(options, "commentId", "comment-id") ?? "");
  if (!COMMENT_ID_PATTERN.test(commentId)) {
    throw new CliError("INVALID_USAGE", "--comment-id CMT-#### is required.");
  }
  return commentId;
}

function parseStatus(raw: string | undefined): CommentStatus {
  const normalized = normalizeCommentStatus(raw ?? "");
  if (normalized) {
    return normalized;
  }

  throw new CliError("INVALID_USAGE", "--status must be 'open' or 'resolved'.");
}

function validateRange(range: CommentRange): void {
  const startsBeforeEnd = range.startLine < range.endLine
    || (range.startLine === range.endLine && range.startCol < range.endCol);

  if (!startsBeforeEnd) {
    throw new CliError("INVALID_PAYLOAD", "Range end must be after range start.");
  }
}

function parsePositiveInt(raw: string, label: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new CliError("INVALID_USAGE", `${label} must be a positive integer.`);
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1) {
    throw new CliError("INVALID_USAGE", `${label} must be a positive integer.`);
  }

  return value;
}

function parseNonNegativeInt(raw: string, label: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new CliError("INVALID_USAGE", `${label} must be a non-negative integer.`);
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 0) {
    throw new CliError("INVALID_USAGE", `${label} must be a non-negative integer.`);
  }

  return value;
}

function parseJsonPositiveInt(raw: unknown, label: string): number {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1) {
    throw new CliError("INVALID_PAYLOAD", `${label} must be a positive integer.`);
  }

  return raw;
}

function parseJsonNonNegativeInt(raw: unknown, label: string): number {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0) {
    throw new CliError("INVALID_PAYLOAD", `${label} must be a non-negative integer.`);
  }

  return raw;
}

function coerceNonEmptyString(value: unknown, message: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new CliError("INVALID_PAYLOAD", message);
  }

  return value;
}

function coerceOptionalString(value: unknown, message: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new CliError("INVALID_PAYLOAD", message);
  }

  return value;
}

function coerceOptionalObject(value: unknown, message: string): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isPlainObject(value)) {
    throw new CliError("INVALID_PAYLOAD", message);
  }

  return value;
}

function readStringOption(options: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = options[key];
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "number") {
      return String(value);
    }
  }

  return undefined;
}

function readBooleanOption(options: Record<string, unknown>, ...keys: string[]): boolean {
  return keys.some((key) => options[key] === true);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

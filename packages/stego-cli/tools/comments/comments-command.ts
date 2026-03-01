import fs from "node:fs";
import path from "node:path";
import { addCommentToManuscript } from "./add-comment.ts";
import type { CommentRange } from "./add-comment.ts";
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

type InputPayload = {
  message?: unknown;
  author?: unknown;
  range?: unknown;
  meta?: unknown;
};

/** Handles `stego comments ...` command group. */
export async function runCommentsCommand(options: RawOptions, cwd: string): Promise<void> {
  const [subcommand, manuscriptArg] = options._;
  if (subcommand !== "add") {
    throw new CommentsCommandError(
      "INVALID_USAGE",
      2,
      "Unknown comments subcommand. Use: stego comments add <manuscript> [--message <text> | --input <path|->]."
    );
  }

  if (!manuscriptArg) {
    throw new CommentsCommandError(
      "INVALID_USAGE",
      2,
      "Manuscript path is required. Use: stego comments add <manuscript> ..."
    );
  }

  const outputFormat = parseOutputFormat(readString(options, "format"));
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

  const payload = inputOption ? readInputPayload(inputOption, cwd, outputFormat) : undefined;
  const payloadMessage = coerceNonEmptyString(payload?.message, "Input payload 'message' must be a non-empty string.", outputFormat);
  const payloadAuthor = coerceOptionalString(payload?.author, "Input payload 'author' must be a string if provided.", outputFormat);
  const payloadRange = payload?.range !== undefined
    ? parsePayloadRange(payload.range, outputFormat)
    : undefined;
  const payloadMeta = payload?.meta !== undefined
    ? coerceOptionalObject(payload.meta, "Input payload 'meta' must be an object if provided.", outputFormat)
    : undefined;

  const optionRange = parseRangeFromOptions(options, outputFormat);
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
  const finalRange = optionRange ?? payloadRange;

  let result;
  try {
    result = addCommentToManuscript({
      manuscriptPath: manuscriptArg,
      cwd,
      message: finalMessage,
      author: finalAuthor,
      range: finalRange,
      sourceMeta: payloadMeta
    });
  } catch (error) {
    if (error instanceof CommentsCommandError && outputFormat === "json" && error.outputFormat !== "json") {
      throw new CommentsCommandError(error.code, error.exitCode, error.message, outputFormat);
    }
    throw error;
  }

  if (outputFormat === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const relativePath = path.relative(cwd, result.manuscript) || result.manuscript;
  if (result.anchor.type === "selection") {
    console.log(`Added ${result.commentId} to ${relativePath} (selection anchor).`);
    return;
  }

  console.log(`Added ${result.commentId} to ${relativePath} (file-level anchor).`);
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

function readInputPayload(
  inputPath: string,
  cwd: string,
  outputFormat: CommentsOutputFormat
): InputPayload {
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

  return parsed as InputPayload;
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

  const range = {
    startLine: parseNonNegativeInt(rawStartLine!, "--start-line", outputFormat),
    startCol: parseNonNegativeInt(rawStartCol!, "--start-col", outputFormat),
    endLine: parseNonNegativeInt(rawEndLine!, "--end-line", outputFormat),
    endCol: parseNonNegativeInt(rawEndCol!, "--end-col", outputFormat)
  };

  validateRange(range, outputFormat);
  return range;
}

function parsePayloadRange(raw: unknown, outputFormat: CommentsOutputFormat): CommentRange {
  if (!isPlainObject(raw)) {
    throw new CommentsCommandError("INVALID_PAYLOAD", 4, "Input payload 'range' must be an object.", outputFormat);
  }

  const parsed = raw as Record<string, unknown>;
  const start = parsed.start;
  const end = parsed.end;
  if (!isPlainObject(start) || !isPlainObject(end)) {
    throw new CommentsCommandError(
      "INVALID_PAYLOAD",
      4,
      "Input payload 'range' must include 'start' and 'end' objects.",
      outputFormat
    );
  }

  const normalized: InputPayloadRange = {
    start: {
      line: parseJsonNonNegativeInt(start.line, "range.start.line", outputFormat),
      col: parseJsonNonNegativeInt(start.col, "range.start.col", outputFormat)
    },
    end: {
      line: parseJsonNonNegativeInt(end.line, "range.end.line", outputFormat),
      col: parseJsonNonNegativeInt(end.col, "range.end.col", outputFormat)
    }
  };

  const range: CommentRange = {
    startLine: normalized.start.line,
    startCol: normalized.start.col,
    endLine: normalized.end.line,
    endCol: normalized.end.col
  };
  validateRange(range, outputFormat);
  return range;
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

function parseNonNegativeInt(raw: string, label: string, outputFormat: CommentsOutputFormat): number {
  if (!/^\d+$/.test(raw)) {
    throw new CommentsCommandError("INVALID_USAGE", 2, `${label} must be a non-negative integer.`, outputFormat);
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) {
    throw new CommentsCommandError("INVALID_USAGE", 2, `${label} must be a non-negative integer.`, outputFormat);
  }

  return value;
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

import process from "node:process";
export const START_SENTINEL = "<!-- stego-comments:start -->";
export const END_SENTINEL = "<!-- stego-comments:end -->";
export function parseCommentAppendix(markdown) {
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
    const errors = [];
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
export function serializeCommentAppendix(comments, lineEnding = "\n") {
    if (comments.length === 0) {
        return "";
    }
    const lines = [];
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
export function upsertCommentAppendix(contentWithoutComments, comments, lineEnding = "\n") {
    const appendix = serializeCommentAppendix(comments, lineEnding);
    if (!appendix) {
        return contentWithoutComments;
    }
    const trimmed = contentWithoutComments.replace(/\s*$/, "");
    return `${trimmed}${lineEnding}${lineEnding}${appendix}${lineEnding}`;
}
export function loadCommentDocumentState(markdownText) {
    const lineEnding = markdownText.includes("\r\n") ? "\r\n" : "\n";
    const parsed = parseCommentAppendix(markdownText);
    const { body, lineOffset } = splitFrontmatterForAnchors(parsed.contentWithoutComments);
    const baseParagraphs = extractParagraphs(body);
    const paragraphs = baseParagraphs.map((paragraph) => ({
        ...paragraph,
        startLine: paragraph.startLine + lineOffset,
        endLine: paragraph.endLine + lineOffset
    }));
    const anchorsById = new Map();
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
export function serializeLoadedState(state) {
    const anchorsById = {};
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
export function ensureNoParseErrors(state) {
    if (state.errors.length === 0) {
        return;
    }
    const first = state.errors[0] ?? "Comment appendix is invalid.";
    throw new Error(first);
}
export function addCommentToState(markdownText, state, input) {
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
    const nextComment = paragraph
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
        nextComment.signature = input.meta;
    }
    return {
        commentId,
        comments: [...state.comments, nextComment]
    };
}
export function replyToCommentInState(state, input) {
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
    const reply = {
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
export function setCommentStatusInState(state, input) {
    const normalizedId = input.commentId.trim().toUpperCase();
    const target = state.comments.find((comment) => comment.id.toUpperCase() === normalizedId);
    if (!target) {
        throw new Error(`Comment ${normalizedId} was not found.`);
    }
    const threadKey = getThreadKey(target);
    const changedIds = [];
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
export function deleteCommentInState(state, commentId) {
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
export function clearResolvedInState(state) {
    const before = state.comments.length;
    const next = state.comments.filter((comment) => comment.status !== "resolved");
    return {
        removed: before - next.length,
        comments: next
    };
}
export function syncAnchorsInState(markdownText, state, input) {
    const updatesById = new Map();
    for (const update of input.updates ?? []) {
        updatesById.set(update.id.trim().toUpperCase(), update);
    }
    let updatedCount = 0;
    let nextComments = state.comments.map((comment) => {
        const update = updatesById.get(comment.id.toUpperCase());
        if (!update) {
            return comment;
        }
        const range = {
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
export function renderStateDocument(state, comments) {
    return upsertCommentAppendix(state.contentWithoutComments, comments, state.lineEnding);
}
export function normalizeAuthor(value) {
    const author = value.trim();
    if (author) {
        return author;
    }
    return process.env.GIT_AUTHOR_NAME
        || process.env.USER
        || process.env.USERNAME
        || "Unknown";
}
function parseCommentThreads(lines, baseLineNumber) {
    const comments = [];
    const errors = [];
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
        const rows = [];
        const rowLineNumbers = [];
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
function parseSingleThread(id, rows, rowLineNumbers) {
    let status = "open";
    const thread = [];
    const errors = [];
    let paragraphIndex;
    let createdAt;
    let timezone;
    let timezoneOffsetMinutes;
    let excerpt;
    let excerptStartLine;
    let excerptStartCol;
    let excerptEndLine;
    let excerptEndCol;
    let signature;
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
        const messageLines = [];
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
    const comment = {
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
        comment.signature = signature;
    }
    return {
        comment,
        errors
    };
}
function encodeCommentMeta64(comment) {
    const payload = {
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
    const signature = comment.signature;
    if (signature && Object.keys(signature).length > 0) {
        payload.signature = signature;
    }
    return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}
function decodeCommentMeta64(encoded, commentId, lineNumber, errors) {
    let rawJson = "";
    try {
        rawJson = Buffer.from(encoded, "base64url").toString("utf8");
    }
    catch {
        errors.push(`Line ${lineNumber}: Invalid meta64 payload for ${commentId}; expected base64url-encoded JSON.`);
        return undefined;
    }
    let parsed;
    try {
        parsed = JSON.parse(rawJson);
    }
    catch {
        errors.push(`Line ${lineNumber}: Invalid meta64 JSON for ${commentId}.`);
        return undefined;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        errors.push(`Line ${lineNumber}: Invalid meta64 object for ${commentId}.`);
        return undefined;
    }
    const record = parsed;
    const status = record.status === "open" || record.status === "resolved"
        ? record.status
        : undefined;
    if (!status) {
        errors.push(`Line ${lineNumber}: meta64 for ${commentId} is missing valid 'status' ('open' or 'resolved').`);
        return undefined;
    }
    const signature = isPlainObject(record.signature) ? record.signature : undefined;
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
function parseOptionalInteger(value) {
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
function parseOptionalSignedInteger(value) {
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
function splitFrontmatterForAnchors(markdownText) {
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
function countLineBreaks(value) {
    const matches = value.match(/\r?\n/g);
    return matches ? matches.length : 0;
}
function extractParagraphs(markdownText) {
    const lines = markdownText.split(/\r?\n/);
    const paragraphs = [];
    let currentStart = -1;
    const currentLines = [];
    const flush = (endIndex) => {
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
function resolveCommentAnchor(comment, paragraphs) {
    if (comment.paragraphIndex === undefined) {
        return {
            anchorType: "file",
            line: 1,
            degraded: false
        };
    }
    const matched = paragraphs.find((paragraph) => paragraph.index === comment.paragraphIndex);
    if (matched) {
        const anchor = {
            anchorType: "paragraph",
            line: matched.startLine,
            degraded: false
        };
        if (hasValidExcerptRange(comment)) {
            anchor.underlineStartLine = comment.excerptStartLine;
            anchor.underlineStartCol = comment.excerptStartCol;
            anchor.underlineEndLine = comment.excerptEndLine;
            anchor.underlineEndCol = comment.excerptEndCol;
        }
        else {
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
function hasValidExcerptRange(comment) {
    if (comment.excerptStartLine === undefined
        || comment.excerptStartCol === undefined
        || comment.excerptEndLine === undefined
        || comment.excerptEndCol === undefined) {
        return false;
    }
    return comment.excerptStartLine < comment.excerptEndLine
        || (comment.excerptStartLine === comment.excerptEndLine && comment.excerptStartCol < comment.excerptEndCol);
}
function hasValidRange(range) {
    return range.startLine < range.endLine
        || (range.startLine === range.endLine && range.startCol < range.endCol);
}
function findParagraphForLine(paragraphs, lineNumber) {
    return paragraphs.find((paragraph) => lineNumber >= paragraph.startLine && lineNumber <= paragraph.endLine);
}
function findPreviousParagraphForLine(paragraphs, lineNumber) {
    for (let index = paragraphs.length - 1; index >= 0; index -= 1) {
        if (paragraphs[index].endLine < lineNumber) {
            return paragraphs[index];
        }
    }
    return undefined;
}
function parseThreadEntry(entry) {
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
function parseThreadHeader(value) {
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
function extractQuotedLine(raw) {
    const quoteMatch = raw.match(/^\s*>\s?(.*)$/);
    if (!quoteMatch) {
        return undefined;
    }
    return quoteMatch[1];
}
function formatHumanTimestamp(raw) {
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
function escapeThreadHeaderPart(value) {
    return value
        .replace(/\\/g, "\\\\")
        .replace(/_/g, "\\_");
}
function formatThreadEntry(timestamp, author, message) {
    return `${timestamp} | ${author} | ${message}`;
}
function compactExcerpt(value, max = 180) {
    const compact = value.replace(/\s+/g, " ").trim();
    if (compact.length <= max) {
        return compact;
    }
    return `${compact.slice(0, max - 1)}…`;
}
function extractExcerptFromRange(markdownText, range) {
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
    }
    else {
        const segments = [];
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
function clamp(value, min, max) {
    if (value < min) {
        return min;
    }
    if (value > max) {
        return max;
    }
    return value;
}
function createNextCommentId(comments) {
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
function getThreadKey(comment) {
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
function indexesOfTrimmedLine(lines, needle) {
    const indexes = [];
    for (let index = 0; index < lines.length; index += 1) {
        if (lines[index].trim() === needle) {
            indexes.push(index);
        }
    }
    return indexes;
}
function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=parser.js.map
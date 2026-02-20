import * as vscode from 'vscode';
import type {
  SidebarCommentListItem,
  SidebarCommentsState
} from '../../shared/types';
import { errorToMessage } from '../../shared/errors';
import {
  extractParagraphs,
  findParagraphForLine,
  findPreviousParagraphForLine,
  resolveCommentAnchor,
  type ParagraphInfo,
  type ResolvedCommentAnchor
} from './commentAnchors';
import { parseCommentAppendix, upsertCommentAppendix } from './commentParser';
import { getCommentThreadKey } from './commentThreadKey';
import type { StegoCommentThread } from './commentTypes';
import type { CommentExcerptTracker } from './commentExcerptTracker';

export type LoadedCommentDocumentState = {
  lineEnding: string;
  contentWithoutComments: string;
  comments: StegoCommentThread[];
  errors: string[];
  paragraphs: ParagraphInfo[];
  anchorsById: Map<string, ResolvedCommentAnchor>;
};

export function loadCommentDocumentState(markdownText: string): LoadedCommentDocumentState {
  const lineEnding = markdownText.includes('\r\n') ? '\r\n' : '\n';
  const parsed = parseCommentAppendix(markdownText);
  const { body, lineOffset } = splitFrontmatterForAnchors(parsed.contentWithoutComments);
  const baseParagraphs = extractParagraphs(body);
  const paragraphs = baseParagraphs.map((paragraph) => ({
    ...paragraph,
    startLine: paragraph.startLine + lineOffset,
    endLine: paragraph.endLine + lineOffset
  }));

  const anchorsById = new Map<string, ResolvedCommentAnchor>();
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

export function buildSidebarCommentsState(markdownText: string, selectedId?: string): SidebarCommentsState {
  const loaded = loadCommentDocumentState(markdownText);
  const normalizedSelection = selectedId?.trim().toUpperCase();

  const sortedComments = [...loaded.comments].sort((a, b) => {
    const aTime = getSortTimestamp(a);
    const bTime = getSortTimestamp(b);
    if (aTime !== bTime) {
      return bTime.localeCompare(aTime);
    }
    return a.id.localeCompare(b.id);
  });

  const selectedExists = normalizedSelection
    ? sortedComments.some((comment) => comment.id.toUpperCase() === normalizedSelection)
    : false;
  const normalizedSelectedId = selectedExists ? normalizedSelection : undefined;

  type ItemWithKey = SidebarCommentListItem & { _threadKey?: string };

  const items: ItemWithKey[] = sortedComments.map((comment) => {
    const anchor = loaded.anchorsById.get(comment.id) ?? { anchorType: comment.paragraphIndex !== undefined ? 'paragraph' : 'file' as const, line: 1, degraded: true };
    const firstMessage = parseThreadEntry(comment.thread[0] ?? '');
    const created = comment.createdAt || firstMessage.timestamp;
    const author = firstMessage.author;
    const message = firstMessage.message || '(No message)';

    const threadKey = getThreadKey(comment);

    return {
      id: comment.id,
      status: comment.status,
      anchor: anchor.anchorType,
      line: anchor.line,
      degraded: anchor.degraded,
      excerpt: comment.excerpt?.trim() || compactExcerpt(message),
      author,
      created,
      message,
      isSelected: normalizedSelectedId === comment.id.toUpperCase(),
      _threadKey: threadKey
    };
  });

  // Group items by thread key
  const threadGroups = new Map<string, ItemWithKey[]>();
  for (const item of items) {
    const key = item._threadKey ?? '';
    let group = threadGroups.get(key);
    if (!group) {
      group = [];
      threadGroups.set(key, group);
    }
    group.push(item);
  }

  // Build the final ordered list with thread positions
  const standaloneItems: ItemWithKey[] = [];
  const multiGroups: ItemWithKey[][] = [];

  for (const group of threadGroups.values()) {
    if (group.length < 2) {
      standaloneItems.push(...group);
    } else {
      // Sort within group: oldest first (ascending timestamp)
      group.sort((a, b) => {
        const aTime = a.created ?? '';
        const bTime = b.created ?? '';
        if (aTime !== bTime) {
          return aTime.localeCompare(bTime);
        }
        return a.id.localeCompare(b.id);
      });
      multiGroups.push(group);
    }
  }

  // Sort groups by oldest member's timestamp, newest group first
  multiGroups.sort((a, b) => {
    const aOldest = a[0]?.created ?? '';
    const bOldest = b[0]?.created ?? '';
    if (aOldest !== bOldest) {
      return bOldest.localeCompare(aOldest);
    }
    return (b[0]?.id ?? '').localeCompare(a[0]?.id ?? '');
  });

  // Assign threadPosition within each multi-item group
  for (const group of multiGroups) {
    for (let i = 0; i < group.length; i++) {
      group[i].threadPosition = i === 0 ? 'first' : i === group.length - 1 ? 'last' : 'middle';
    }
  }

  // Merge: interleave groups and standalone items by newest-first timestamp
  // Groups use oldest member timestamp for placement; standalone uses own timestamp
  type Placeable = { sortKey: string; items: ItemWithKey[] };
  const placeables: Placeable[] = [];

  for (const group of multiGroups) {
    placeables.push({ sortKey: group[0]?.created ?? '', items: group });
  }
  for (const item of standaloneItems) {
    placeables.push({ sortKey: item.created ?? '', items: [item] });
  }

  placeables.sort((a, b) => {
    if (a.sortKey !== b.sortKey) {
      return b.sortKey.localeCompare(a.sortKey);
    }
    return (b.items[0]?.id ?? '').localeCompare(a.items[0]?.id ?? '');
  });

  const finalItems: SidebarCommentListItem[] = [];
  for (const placeable of placeables) {
    for (const item of placeable.items) {
      const { _threadKey, ...clean } = item;
      finalItems.push(clean);
    }
  }

  return {
    selectedId: normalizedSelectedId,
    items: finalItems,
    parseErrors: loaded.errors,
    totalCount: loaded.comments.length,
    unresolvedCount: loaded.comments.filter((comment) => comment.status === 'open').length
  };
}

export async function addCommentAtSelection(
  document: vscode.TextDocument,
  message: string,
  author: string
): Promise<{ id?: string; warning?: string }> {
  const normalizedMessage = message.trim();
  if (!normalizedMessage) {
    return { warning: 'Comment text cannot be empty.' };
  }

  const loaded = loadCommentDocumentState(document.getText());
  if (loaded.errors.length > 0) {
    return { warning: `Cannot edit comments until appendix errors are fixed: ${loaded.errors[0]}` };
  }

  const activeEditor = vscode.window.activeTextEditor;
  const cursorLine = activeEditor && activeEditor.document.uri.toString() === document.uri.toString()
    ? activeEditor.selection.active.line + 1
    : 1;

  const paragraph = findParagraphForLine(loaded.paragraphs, cursorLine)
    ?? findPreviousParagraphForLine(loaded.paragraphs, cursorLine);

  // Check if the user has a non-empty text selection
  let selectionExcerpt: string | undefined;
  let excerptStartLine: number | undefined;
  let excerptStartCol: number | undefined;
  let excerptEndLine: number | undefined;
  let excerptEndCol: number | undefined;
  let hasExplicitSelectionRange = false;

  if (activeEditor && activeEditor.document.uri.toString() === document.uri.toString()) {
    const selection = activeEditor.selection;
    if (!selection.isEmpty) {
      const selectedText = activeEditor.document.getText(selection);
      selectionExcerpt = compactExcerpt(selectedText);
      excerptStartLine = selection.start.line + 1;
      excerptStartCol = selection.start.character;
      excerptEndLine = selection.end.line + 1;
      excerptEndCol = selection.end.character;
      hasExplicitSelectionRange = true;
    }
  }

  const now = new Date().toISOString();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  const timezoneOffsetMinutes = -new Date().getTimezoneOffset();
  const commentId = createNextCommentId(loaded.comments);
  const normalizedAuthor = normalizeAuthor(author);

  const nextComment: StegoCommentThread = paragraph
    ? {
      id: commentId,
      status: 'open',
      createdAt: now,
      timezone,
      timezoneOffsetMinutes,
      paragraphIndex: paragraph.index,
      excerpt: selectionExcerpt ?? compactExcerpt(paragraph.text),
      ...(hasExplicitSelectionRange
        ? {
          excerptStartLine,
          excerptStartCol,
          excerptEndLine,
          excerptEndCol
        }
        : {}),
      thread: [formatThreadEntry(now, normalizedAuthor, normalizedMessage)]
    }
    : {
      id: commentId,
      status: 'open',
      createdAt: now,
      timezone,
      timezoneOffsetMinutes,
      excerpt: '(File-level comment)',
      thread: [formatThreadEntry(now, normalizedAuthor, normalizedMessage)]
    };

  const nextComments = [...loaded.comments, nextComment];
  await persistComments(document, loaded, nextComments);
  return { id: commentId };
}

export async function replyToComment(
  document: vscode.TextDocument,
  commentId: string,
  message: string,
  author: string
): Promise<{ id?: string; warning?: string }> {
  const normalizedMessage = message.trim();
  if (!normalizedMessage) {
    return { warning: 'Reply cannot be empty.' };
  }

  const loaded = loadCommentDocumentState(document.getText());
  if (loaded.errors.length > 0) {
    return { warning: `Cannot edit comments until appendix errors are fixed: ${loaded.errors[0]}` };
  }

  const normalizedId = commentId.trim().toUpperCase();
  const target = loaded.comments.find((comment) => comment.id.toUpperCase() === normalizedId);
  if (!target) {
    return { warning: `Comment ${normalizedId} was not found.` };
  }

  const now = new Date().toISOString();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  const timezoneOffsetMinutes = -new Date().getTimezoneOffset();
  const normalizedAuthor = normalizeAuthor(author);
  const nextId = createNextCommentId(loaded.comments);

  const reply: StegoCommentThread = {
    id: nextId,
    status: 'open',
    createdAt: now,
    timezone,
    timezoneOffsetMinutes,
    paragraphIndex: target.paragraphIndex,
    excerpt: target.excerpt,
    excerptStartLine: target.excerptStartLine,
    excerptStartCol: target.excerptStartCol,
    excerptEndLine: target.excerptEndLine,
    excerptEndCol: target.excerptEndCol,
    thread: [formatThreadEntry(now, normalizedAuthor, normalizedMessage)]
  };

  const nextComments = [...loaded.comments, reply];
  await persistComments(document, loaded, nextComments);
  return { id: nextId };
}

export async function toggleCommentResolved(
  document: vscode.TextDocument,
  commentId: string,
  resolveThread = false
): Promise<{ warning?: string; resolved?: boolean }> {
  const loaded = loadCommentDocumentState(document.getText());
  if (loaded.errors.length > 0) {
    return { warning: `Cannot edit comments until appendix errors are fixed: ${loaded.errors[0]}` };
  }

  const normalizedId = commentId.trim().toUpperCase();
  const target = loaded.comments.find((comment) => comment.id.toUpperCase() === normalizedId);
  if (!target) {
    return { warning: `Comment ${normalizedId} was not found.` };
  }

  const nextStatus = target.status === 'resolved' ? 'open' : 'resolved';
  const targets = resolveThread ? getThreadSiblings(target, loaded.comments) : [target];

  for (const comment of targets) {
    comment.status = nextStatus;
  }

  await persistComments(document, loaded, loaded.comments);
  return { resolved: nextStatus === 'resolved' };
}

export async function clearResolvedComments(document: vscode.TextDocument): Promise<{ removed: number; warning?: string }> {
  const loaded = loadCommentDocumentState(document.getText());
  if (loaded.errors.length > 0) {
    return { removed: 0, warning: `Cannot edit comments until appendix errors are fixed: ${loaded.errors[0]}` };
  }

  const before = loaded.comments.length;
  const next = loaded.comments.filter((comment) => comment.status !== 'resolved');
  const removed = before - next.length;
  if (removed === 0) {
    return { removed: 0 };
  }

  await persistComments(document, loaded, next);
  return { removed };
}

export async function deleteComment(
  document: vscode.TextDocument,
  commentId: string
): Promise<{ warning?: string }> {
  const loaded = loadCommentDocumentState(document.getText());
  if (loaded.errors.length > 0) {
    return { warning: `Cannot edit comments until appendix errors are fixed: ${loaded.errors[0]}` };
  }

  const normalizedId = commentId.trim().toUpperCase();
  const target = loaded.comments.find((comment) => comment.id.toUpperCase() === normalizedId);
  if (!target) {
    return { warning: `Comment ${normalizedId} was not found.` };
  }

  const next = loaded.comments.filter((comment) => comment.id.toUpperCase() !== normalizedId);
  await persistComments(document, loaded, next);
  return {};
}

export async function jumpToComment(document: vscode.TextDocument, commentId: string): Promise<{ warning?: string }> {
  const loaded = loadCommentDocumentState(document.getText());
  const normalizedId = commentId.trim().toUpperCase();
  const comment = loaded.comments.find((entry) => entry.id.toUpperCase() === normalizedId);
  if (!comment) {
    return { warning: `Comment ${normalizedId} was not found.` };
  }

  const resolved = loaded.anchorsById.get(comment.id)
    ?? { anchorType: comment.paragraphIndex !== undefined ? 'paragraph' : 'file' as const, line: 1, degraded: true as const };
  const line = Math.max(1, resolved.line);

  const editor = await vscode.window.showTextDocument(document, { preview: false, preserveFocus: false });
  const position = new vscode.Position(line - 1, 0);
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);

  return {};
}

export async function persistExcerptUpdates(
  document: vscode.TextDocument,
  tracker: CommentExcerptTracker
): Promise<void> {
  const uri = document.uri.toString();
  if (!tracker.hasPendingChanges(uri)) {
    return;
  }

  const loaded = loadCommentDocumentState(document.getText());
  if (loaded.errors.length > 0) {
    return;
  }

  const trackedEntries = tracker.getTracked(uri);
  if (!trackedEntries) {
    return;
  }

  const trackedById = new Map(trackedEntries.map((t) => [t.id, t]));
  let changed = false;

  for (const comment of loaded.comments) {
    const tracked = trackedById.get(comment.id);
    if (!tracked || !tracked.dirty || tracked.deleted) {
      continue;
    }

    // Convert from 0-based lines back to 1-based
    const newStartLine = tracked.start.line + 1;
    const newStartCol = tracked.start.character;
    const newEndLine = tracked.end.line + 1;
    const newEndCol = tracked.end.character;

    comment.excerptStartLine = newStartLine;
    comment.excerptStartCol = newStartCol;
    comment.excerptEndLine = newEndLine;
    comment.excerptEndCol = newEndCol;

    // Recompute excerpt text from document at new coordinates
    try {
      const startPos = new vscode.Position(tracked.start.line, tracked.start.character);
      const endPos = new vscode.Position(tracked.end.line, tracked.end.character);
      const range = new vscode.Range(startPos, endPos);
      const text = document.getText(range);
      comment.excerpt = compactExcerpt(text);
    } catch {
      // If range is out of bounds, keep old excerpt
    }

    // Recompute paragraph anchor based on new position
    const paragraphs = loaded.paragraphs;
    const paragraph = findParagraphForLine(paragraphs, newStartLine)
      ?? findPreviousParagraphForLine(paragraphs, newStartLine);
    if (paragraph) {
      comment.paragraphIndex = paragraph.index;
    }

    changed = true;
  }

  if (changed) {
    await persistComments(document, loaded, loaded.comments);
    tracker.load(uri, loaded.comments);
  }
}

export async function deleteCommentsByIds(
  document: vscode.TextDocument,
  ids: string[],
  tracker: CommentExcerptTracker
): Promise<number> {
  if (ids.length === 0) {
    return 0;
  }

  const loaded = loadCommentDocumentState(document.getText());
  if (loaded.errors.length > 0) {
    return 0;
  }

  const idsToDelete = new Set(ids.map((id) => id.toUpperCase()));
  const next = loaded.comments.filter((comment) => !idsToDelete.has(comment.id.toUpperCase()));
  const removed = loaded.comments.length - next.length;

  if (removed === 0) {
    return 0;
  }

  await persistComments(document, loaded, next);
  tracker.load(document.uri.toString(), next);
  return removed;
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

function getThreadKey(comment: StegoCommentThread): string {
  return getCommentThreadKey(comment);
}

function getThreadSiblings(target: StegoCommentThread, comments: StegoCommentThread[]): StegoCommentThread[] {
  const key = getThreadKey(target);
  return comments.filter((c) => getThreadKey(c) === key);
}

function getSortTimestamp(comment: StegoCommentThread): string {
  if (comment.createdAt) {
    const createdDate = new Date(comment.createdAt);
    if (!isNaN(createdDate.getTime())) {
      return createdDate.toISOString();
    }
  }

  const firstMessage = comment.thread[0];
  if (!firstMessage) {
    return '';
  }

  const raw = parseThreadEntry(firstMessage).timestamp;
  const date = new Date(raw);
  return isNaN(date.getTime()) ? raw : date.toISOString();
}

function createNextCommentId(comments: StegoCommentThread[]): string {
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

  return `CMT-${String(max + 1).padStart(4, '0')}`;
}

function formatThreadEntry(timestamp: string, author: string, message: string): string {
  return `${timestamp} | ${author} | ${message}`;
}

function compactExcerpt(value: string, max = 180): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) {
    return compact;
  }
  return `${compact.slice(0, max - 1)}…`;
}

export function normalizeAuthor(value: string): string {
  const author = value.trim();
  if (author) {
    return author;
  }

  return process.env.GIT_AUTHOR_NAME
    || process.env.USER
    || process.env.USERNAME
    || 'Unknown';
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

async function persistComments(
  document: vscode.TextDocument,
  loaded: LoadedCommentDocumentState,
  comments: StegoCommentThread[]
): Promise<void> {
  const nextText = upsertCommentAppendix(loaded.contentWithoutComments, comments, loaded.lineEnding);
  const currentText = document.getText();

  if (nextText === currentText) {
    return;
  }

  const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(currentText.length));
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, fullRange, nextText);

  const applied = await vscode.workspace.applyEdit(edit);
  if (!applied) {
    throw new Error('Could not apply comment edits.');
  }

  try {
    await document.save();
  } catch (error) {
    throw new Error(`Could not auto-save comment changes: ${errorToMessage(error)}`);
  }
}

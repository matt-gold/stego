import * as vscode from 'vscode';
import { errorToMessage } from '../../shared/errors';
import type { SidebarCommentsState } from '../../shared/types';
import { CommentCliClient } from './commentCliClient';
import {
  buildAddCommentPayload,
  buildSidebarCommentsState as buildSidebarCommentsStateFromModel,
  buildSyncAnchorsPayload
} from './commentModel';
import type { CommentExcerptTracker } from './commentExcerptTracker';
import type { StegoCommentDocumentState } from './commentTypes';

const commentCli = new CommentCliClient();
const commentStateByUri = new Map<string, StegoCommentDocumentState>();

export type PersistExcerptSyncResult = {
  updatedCount: number;
  deletedCount: number;
  warning?: string;
};

export function getCachedCommentState(documentUri: string): StegoCommentDocumentState | undefined {
  return commentStateByUri.get(documentUri);
}

export function clearCachedCommentState(documentUri: string): void {
  commentStateByUri.delete(documentUri);
}

export function buildSidebarCommentsState(documentUri: string, selectedId?: string): SidebarCommentsState {
  const state = commentStateByUri.get(documentUri);
  return buildSidebarCommentsStateFromModel(state, selectedId);
}

export async function refreshCommentState(
  document: vscode.TextDocument,
  options?: { showWarning?: boolean }
): Promise<{ state?: StegoCommentDocumentState; warning?: string }> {
  if (document.languageId !== 'markdown') {
    return {};
  }

  const result = await commentCli.read(document.uri.fsPath, { showWarning: options?.showWarning });
  if ('warning' in result) {
    return { warning: result.warning };
  }

  commentStateByUri.set(document.uri.toString(), result.state);
  return { state: result.state };
}

export async function readCommentStateForFile(
  filePath: string,
  options?: { showWarning?: boolean }
): Promise<{ state?: StegoCommentDocumentState; warning?: string }> {
  const result = await commentCli.read(filePath, { showWarning: options?.showWarning });
  if ('warning' in result) {
    return { warning: result.warning };
  }

  commentStateByUri.set(vscode.Uri.file(filePath).toString(), result.state);
  return { state: result.state };
}

export async function getDocumentContentWithoutComments(
  document: vscode.TextDocument,
  options?: { showWarning?: boolean }
): Promise<string> {
  const fromCache = commentStateByUri.get(document.uri.toString());
  if (fromCache) {
    return fromCache.contentWithoutComments;
  }

  const refreshed = await refreshCommentState(document, { showWarning: options?.showWarning });
  if (refreshed.state) {
    return refreshed.state.contentWithoutComments;
  }

  return stripStegoCommentsAppendix(document.getText());
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

  const saved = await ensureDocumentSaved(document);
  if (saved.warning) {
    return { warning: saved.warning };
  }

  const activeEditor = vscode.window.activeTextEditor;
  const isActiveDocument = !!activeEditor && activeEditor.document.uri.toString() === document.uri.toString();

  const cursorLine = isActiveDocument
    ? activeEditor.selection.active.line + 1
    : 1;

  const selection = isActiveDocument && !activeEditor.selection.isEmpty
    ? {
      startLine: activeEditor.selection.start.line + 1,
      startCol: activeEditor.selection.start.character,
      endLine: activeEditor.selection.end.line + 1,
      endCol: activeEditor.selection.end.character
    }
    : undefined;

  const payload = buildAddCommentPayload({
    message: normalizedMessage,
    author: normalizeAuthor(author),
    selection,
    cursorLine
  });

  const result = await commentCli.add(document.uri.fsPath, payload);
  if ('warning' in result) {
    return { warning: result.warning };
  }

  await refreshCacheAfterMutation(document, result.state);
  return { id: result.commentId };
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

  const saved = await ensureDocumentSaved(document);
  if (saved.warning) {
    return { warning: saved.warning };
  }

  const result = await commentCli.reply(document.uri.fsPath, commentId.trim().toUpperCase(), {
    message: normalizedMessage,
    author: normalizeAuthor(author)
  });

  if ('warning' in result) {
    return { warning: result.warning };
  }

  await refreshCacheAfterMutation(document, result.state);
  return { id: result.commentId };
}

export async function toggleCommentResolved(
  document: vscode.TextDocument,
  commentId: string,
  resolveThread = false
): Promise<{ warning?: string; resolved?: boolean }> {
  const saved = await ensureDocumentSaved(document);
  if (saved.warning) {
    return { warning: saved.warning };
  }

  const loaded = await getOrRefreshState(document, { showWarning: true });
  if (loaded.warning) {
    return { warning: loaded.warning };
  }
  if (!loaded.state) {
    return { warning: 'Could not read comments state.' };
  }
  if (loaded.state.parseErrors.length > 0) {
    return { warning: `Cannot edit comments until appendix errors are fixed: ${loaded.state.parseErrors[0]}` };
  }

  const normalizedId = commentId.trim().toUpperCase();
  const target = loaded.state.comments.find((entry) => entry.id.toUpperCase() === normalizedId);
  if (!target) {
    return { warning: `Comment ${normalizedId} was not found.` };
  }

  const nextStatus = target.status === 'resolved' ? 'open' : 'resolved';
  const result = await commentCli.setStatus(document.uri.fsPath, normalizedId, nextStatus, resolveThread);
  if ('warning' in result) {
    return { warning: result.warning };
  }

  await refreshCacheAfterMutation(document, result.state);
  return { resolved: nextStatus === 'resolved' };
}

export async function clearResolvedComments(document: vscode.TextDocument): Promise<{ removed: number; warning?: string }> {
  const saved = await ensureDocumentSaved(document);
  if (saved.warning) {
    return { removed: 0, warning: saved.warning };
  }

  const result = await commentCli.clearResolved(document.uri.fsPath);
  if ('warning' in result) {
    return { removed: 0, warning: result.warning };
  }

  await refreshCacheAfterMutation(document, result.state);
  return { removed: result.removed ?? 0 };
}

export async function deleteComment(
  document: vscode.TextDocument,
  commentId: string
): Promise<{ warning?: string }> {
  const saved = await ensureDocumentSaved(document);
  if (saved.warning) {
    return { warning: saved.warning };
  }

  const result = await commentCli.delete(document.uri.fsPath, commentId.trim().toUpperCase());
  if ('warning' in result) {
    return { warning: result.warning };
  }

  await refreshCacheAfterMutation(document, result.state);
  return {};
}

export async function jumpToComment(document: vscode.TextDocument, commentId: string): Promise<{ warning?: string }> {
  const loaded = await getOrRefreshState(document, { showWarning: true });
  if (loaded.warning) {
    return { warning: loaded.warning };
  }

  const state = loaded.state;
  if (!state) {
    return { warning: 'Could not read comments state.' };
  }

  const normalizedId = commentId.trim().toUpperCase();
  const comment = state.comments.find((entry) => entry.id.toUpperCase() === normalizedId);
  if (!comment) {
    return { warning: `Comment ${normalizedId} was not found.` };
  }

  const anchor = state.anchorsById[comment.id] ?? {
    anchorType: comment.paragraphIndex !== undefined ? 'paragraph' as const : 'file' as const,
    line: 1,
    degraded: true
  };

  const line = Math.max(1, anchor.line);
  const editor = await vscode.window.showTextDocument(document, { preview: false, preserveFocus: false });
  const position = new vscode.Position(line - 1, 0);
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);

  return {};
}

export async function persistExcerptUpdates(
  document: vscode.TextDocument,
  tracker: CommentExcerptTracker
): Promise<PersistExcerptSyncResult> {
  const uri = document.uri.toString();
  if (!tracker.hasPendingChanges(uri)) {
    return {
      updatedCount: 0,
      deletedCount: 0
    };
  }

  const loaded = await getOrRefreshState(document, { showWarning: false });
  if (loaded.warning) {
    return {
      updatedCount: 0,
      deletedCount: 0,
      warning: loaded.warning
    };
  }

  const state = loaded.state;
  if (!state) {
    return {
      updatedCount: 0,
      deletedCount: 0,
      warning: 'Could not read comments state.'
    };
  }

  if (state.parseErrors.length > 0) {
    return {
      updatedCount: 0,
      deletedCount: 0
    };
  }

  const trackedEntries = tracker.getTracked(uri) ?? [];
  const deletedIds = tracker.getDeletedThreadIds(uri, state.comments);
  const payload = buildSyncAnchorsPayload(trackedEntries, deletedIds);
  if ((payload.updates?.length ?? 0) === 0 && (payload.delete_ids?.length ?? 0) === 0) {
    return {
      updatedCount: 0,
      deletedCount: 0
    };
  }

  const saved = await ensureDocumentSaved(document);
  if (saved.warning) {
    return {
      updatedCount: 0,
      deletedCount: 0,
      warning: saved.warning
    };
  }

  const result = await commentCli.syncAnchors(document.uri.fsPath, payload, { showWarning: false });
  if ('warning' in result) {
    return {
      updatedCount: 0,
      deletedCount: 0,
      warning: result.warning
    };
  }

  const nextState = await refreshCacheAfterMutation(document, result.state);
  tracker.load(uri, nextState.comments);

  return {
    updatedCount: result.updatedCount ?? payload.updates?.length ?? 0,
    deletedCount: result.deletedCount ?? payload.delete_ids?.length ?? 0
  };
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

export function stripStegoCommentsAppendix(markdown: string): string {
  const lineEnding = markdown.includes('\r\n') ? '\r\n' : '\n';
  const lines = markdown.split(/\r?\n/);
  const start = findSingleLineIndex(lines, '<!-- stego-comments:start -->');
  const end = findSingleLineIndex(lines, '<!-- stego-comments:end -->');

  if (start === undefined || end === undefined || end <= start) {
    return markdown;
  }

  let removeStart = start;
  if (removeStart > 0 && lines[removeStart - 1].trim().length === 0) {
    removeStart -= 1;
  }

  const kept = [...lines.slice(0, removeStart), ...lines.slice(end + 1)];
  while (kept.length > 0 && kept[kept.length - 1].trim().length === 0) {
    kept.pop();
  }

  return kept.join(lineEnding);
}

async function getOrRefreshState(
  document: vscode.TextDocument,
  options?: { showWarning?: boolean }
): Promise<{ state?: StegoCommentDocumentState; warning?: string }> {
  const cached = commentStateByUri.get(document.uri.toString());
  if (cached) {
    return { state: cached };
  }

  return refreshCommentState(document, { showWarning: options?.showWarning });
}

async function refreshCacheAfterMutation(
  document: vscode.TextDocument,
  fallbackState: StegoCommentDocumentState
): Promise<StegoCommentDocumentState> {
  commentStateByUri.set(document.uri.toString(), fallbackState);

  const refreshed = await refreshCommentState(document, { showWarning: false });
  if (refreshed.state) {
    return refreshed.state;
  }

  return fallbackState;
}

async function ensureDocumentSaved(document: vscode.TextDocument): Promise<{ warning?: string }> {
  if (!document.isDirty) {
    return {};
  }

  try {
    const saved = await document.save();
    if (!saved) {
      return { warning: 'Could not save manuscript before updating comments.' };
    }
    return {};
  } catch (error) {
    return { warning: `Could not save manuscript before updating comments: ${errorToMessage(error)}` };
  }
}

function findSingleLineIndex(lines: string[], needle: string): number | undefined {
  let found: number | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() !== needle) {
      continue;
    }

    if (found !== undefined) {
      return undefined;
    }

    found = index;
  }

  return found;
}

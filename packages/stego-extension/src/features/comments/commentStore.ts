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
import type { StegoCommentThread } from './commentTypes';

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

  const items: SidebarCommentListItem[] = sortedComments.map((comment) => {
    const anchor = loaded.anchorsById.get(comment.id) ?? { anchorType: comment.anchor, line: 1, degraded: true };
    const firstMessage = parseThreadEntry(comment.thread[0] ?? '');
    const created = firstMessage.timestamp;
    const author = firstMessage.author;
    const message = firstMessage.message || '(No message)';

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
      isSelected: normalizedSelectedId === comment.id.toUpperCase()
    };
  });

  return {
    selectedId: normalizedSelectedId,
    items,
    parseErrors: loaded.errors,
    totalCount: loaded.comments.length,
    openCount: loaded.comments.filter((comment) => comment.status === 'open').length
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

  const now = new Date().toISOString();
  const commentId = createNextCommentId(loaded.comments);
  const normalizedAuthor = normalizeAuthor(author);

  const nextComment: StegoCommentThread = paragraph
    ? {
      id: commentId,
      status: 'open',
      anchor: 'paragraph',
      paragraphIndex: paragraph.index,
      signature: paragraph.signature,
      excerpt: compactExcerpt(paragraph.text),
      thread: [formatThreadEntry(now, normalizedAuthor, normalizedMessage)]
    }
    : {
      id: commentId,
      status: 'open',
      anchor: 'file',
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
  const normalizedAuthor = normalizeAuthor(author);
  const nextId = createNextCommentId(loaded.comments);

  const reply: StegoCommentThread = {
    id: nextId,
    status: 'open',
    anchor: target.anchor,
    paragraphIndex: target.anchor === 'paragraph' ? target.paragraphIndex : undefined,
    signature: target.anchor === 'paragraph' ? target.signature : undefined,
    excerpt: target.excerpt,
    thread: [formatThreadEntry(now, normalizedAuthor, normalizedMessage)]
  };

  const nextComments = [...loaded.comments, reply];
  await persistComments(document, loaded, nextComments);
  return { id: nextId };
}

export async function toggleCommentResolved(
  document: vscode.TextDocument,
  commentId: string
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

  if (target.status === 'resolved') {
    target.status = 'open';
    await persistComments(document, loaded, loaded.comments);
    return { resolved: false };
  }

  target.status = 'resolved';
  await persistComments(document, loaded, loaded.comments);
  return { resolved: true };
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

export async function jumpToComment(document: vscode.TextDocument, commentId: string): Promise<{ warning?: string }> {
  const loaded = loadCommentDocumentState(document.getText());
  const normalizedId = commentId.trim().toUpperCase();
  const comment = loaded.comments.find((entry) => entry.id.toUpperCase() === normalizedId);
  if (!comment) {
    return { warning: `Comment ${normalizedId} was not found.` };
  }

  const resolved = loaded.anchorsById.get(comment.id)
    ?? { anchorType: comment.anchor, line: 1, degraded: true as const };
  const line = Math.max(1, resolved.line);

  const editor = await vscode.window.showTextDocument(document, { preview: false, preserveFocus: false });
  const position = new vscode.Position(line - 1, 0);
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);

  return {};
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

function getSortTimestamp(comment: StegoCommentThread): string {
  const firstMessage = comment.thread[0];
  if (!firstMessage) {
    return '';
  }

  return parseThreadEntry(firstMessage).timestamp;
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

function normalizeAuthor(value: string): string {
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

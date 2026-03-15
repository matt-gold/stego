import * as vscode from 'vscode';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { getCachedCommentState } from './commentStore';
import { getConfig } from '../project';
import type { CommentExcerptTracker } from './commentExcerptTracker';
import { buildDecorationCommentEntries } from './commentModel';

dayjs.extend(relativeTime);

export class CommentDecorationsService implements vscode.Disposable {
  private static readonly UNRESOLVED_COMMENT_YELLOW = '#c4a24a';

  private readonly unresolvedDecoration: vscode.TextEditorDecorationType;
  private readonly resolvedDecoration: vscode.TextEditorDecorationType;
  private readonly lineUnderlineDecoration: vscode.TextEditorDecorationType;
  private readonly unresolvedLineUnderlineDecoration: vscode.TextEditorDecorationType;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly excerptTracker: CommentExcerptTracker
  ) {
    this.unresolvedDecoration = vscode.window.createTextEditorDecorationType({
      gutterIconPath: vscode.Uri.joinPath(extensionUri, 'assets', 'comment-open.svg'),
      gutterIconSize: 'contain'
    });

    this.resolvedDecoration = vscode.window.createTextEditorDecorationType({
      gutterIconPath: vscode.Uri.joinPath(extensionUri, 'assets', 'comment-resolved.svg'),
      gutterIconSize: 'contain'
    });

    this.lineUnderlineDecoration = vscode.window.createTextEditorDecorationType({
      textDecoration: 'underline dotted',
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    });

    this.unresolvedLineUnderlineDecoration = vscode.window.createTextEditorDecorationType({
      textDecoration: `underline dotted ${CommentDecorationsService.UNRESOLVED_COMMENT_YELLOW}`,
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    });
  }

  public dispose(): void {
    this.clearAll();
    this.unresolvedDecoration.dispose();
    this.resolvedDecoration.dispose();
    this.lineUnderlineDecoration.dispose();
    this.unresolvedLineUnderlineDecoration.dispose();
  }

  public clearAll(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      editor.setDecorations(this.unresolvedDecoration, []);
      editor.setDecorations(this.resolvedDecoration, []);
      editor.setDecorations(this.lineUnderlineDecoration, []);
      editor.setDecorations(this.unresolvedLineUnderlineDecoration, []);
    }
  }

  public refreshVisibleEditors(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      this.refreshEditor(editor);
    }
  }

  public refreshEditor(editor: vscode.TextEditor | undefined): void {
    if (!editor || editor.document.languageId !== 'markdown') {
      return;
    }

    if (!getConfig('comments', editor.document.uri).get<boolean>('enable', true)) {
      editor.setDecorations(this.unresolvedDecoration, []);
      editor.setDecorations(this.resolvedDecoration, []);
      editor.setDecorations(this.lineUnderlineDecoration, []);
      editor.setDecorations(this.unresolvedLineUnderlineDecoration, []);
      return;
    }

    const state = getCachedCommentState(editor.document.uri.toString());
    if (!state || state.parseErrors.length > 0 || state.comments.length === 0) {
      editor.setDecorations(this.unresolvedDecoration, []);
      editor.setDecorations(this.resolvedDecoration, []);
      editor.setDecorations(this.lineUnderlineDecoration, []);
      editor.setDecorations(this.unresolvedLineUnderlineDecoration, []);
      return;
    }

    type CommentEntry = {
      id: string;
      status: 'open' | 'resolved';
      thread: string[];
      createdAt?: string;
      line: number;
      range: vscode.Range;
    };

    type AnchorEntry = {
      id: string;
      status: 'open' | 'resolved';
      thread: string[];
      createdAt?: string;
      underlineStartLine?: number;
      underlineStartCol?: number;
      underlineEndLine?: number;
      underlineEndCol?: number;
      paragraphEndLine?: number;
    };

    const trackedEntries = this.excerptTracker.getTracked(editor.document.uri.toString());
    const overlayEntries: Array<{ id: string; startLine: number; startCol: number; endLine: number; endCol: number; deleted: boolean }> = [];
    if (trackedEntries) {
      for (const t of trackedEntries) {
        overlayEntries.push({
          id: t.id,
          startLine: t.start.line + 1,
          startCol: t.start.character,
          endLine: t.end.line + 1,
          endCol: t.end.character,
          deleted: t.deleted
        });
      }
    }

    const byLine = new Map<number, AnchorEntry[]>();
    const commentEntries: CommentEntry[] = [];
    const resolvedEntries = buildDecorationCommentEntries(state, overlayEntries);

    for (const comment of resolvedEntries) {
      const line = clampLine(comment.line, editor.document.lineCount);
      const anchorEntry: AnchorEntry = {
        id: comment.id,
        status: comment.status,
        thread: [...comment.thread],
        createdAt: comment.createdAt,
        underlineStartLine: comment.underlineStartLine,
        underlineStartCol: comment.underlineStartCol,
        underlineEndLine: comment.underlineEndLine,
        underlineEndCol: comment.underlineEndCol,
        paragraphEndLine: comment.paragraphEndLine
      };

      let textRange: vscode.Range;
      if (
        anchorEntry.underlineStartLine !== undefined &&
        anchorEntry.underlineStartCol !== undefined &&
        anchorEntry.underlineEndLine !== undefined &&
        anchorEntry.underlineEndCol !== undefined
      ) {
        const startLine = clampLine(anchorEntry.underlineStartLine, editor.document.lineCount) - 1;
        const endLine = clampLine(anchorEntry.underlineEndLine, editor.document.lineCount) - 1;
        textRange = new vscode.Range(
          new vscode.Position(startLine, anchorEntry.underlineStartCol),
          new vscode.Position(endLine, anchorEntry.underlineEndCol)
        );
      } else {
        const startLine = line - 1;
        const endLine = anchorEntry.paragraphEndLine
          ? clampLine(anchorEntry.paragraphEndLine, editor.document.lineCount) - 1
          : startLine;
        const endLineLength = editor.document.lineAt(endLine).text.length;
        textRange = new vscode.Range(
          new vscode.Position(startLine, 0),
          new vscode.Position(endLine, endLineLength)
        );
      }

      const bucket = byLine.get(line) ?? [];
      bucket.push(anchorEntry);
      byLine.set(line, bucket);

      commentEntries.push({
        id: comment.id,
        status: comment.status,
        thread: [...comment.thread],
        createdAt: comment.createdAt,
        line,
        range: textRange
      });
    }

    const unresolvedOptions: vscode.DecorationOptions[] = [];
    const resolvedOptions: vscode.DecorationOptions[] = [];
    const underlineOptions: vscode.DecorationOptions[] = [];
    const unresolvedUnderlineOptions: vscode.DecorationOptions[] = [];

    for (const [line, comments] of byLine.entries()) {
      const hasUnresolved = comments.some((entry) => entry.status === 'open');
      const iconRange = new vscode.Range(
        new vscode.Position(line - 1, 0),
        new vscode.Position(line - 1, 0)
      );
      const option: vscode.DecorationOptions = { range: iconRange };

      if (hasUnresolved) {
        unresolvedOptions.push(option);
      } else {
        resolvedOptions.push(option);
      }
    }

    const overlapGroups = buildOverlapGroups(commentEntries);
    const rangeState = new Map<string, { hasUnresolved: boolean; option: vscode.DecorationOptions }>();
    for (const group of overlapGroups) {
      const hover = buildHoverMarkdown(group);
      for (const entry of group) {
        const option: vscode.DecorationOptions = {
          range: entry.range,
          hoverMessage: hover
        };
        const key = `${entry.range.start.line}:${entry.range.start.character}-${entry.range.end.line}:${entry.range.end.character}`;
        const existing = rangeState.get(key);
        if (existing) {
          existing.hasUnresolved = existing.hasUnresolved || entry.status === 'open';
          continue;
        }

        rangeState.set(key, {
          hasUnresolved: entry.status === 'open',
          option
        });
      }
    }

    for (const stateEntry of rangeState.values()) {
      if (stateEntry.hasUnresolved) {
        unresolvedUnderlineOptions.push(stateEntry.option);
      } else {
        underlineOptions.push(stateEntry.option);
      }
    }

    editor.setDecorations(this.unresolvedDecoration, unresolvedOptions);
    editor.setDecorations(this.resolvedDecoration, resolvedOptions);
    editor.setDecorations(this.lineUnderlineDecoration, underlineOptions);
    editor.setDecorations(this.unresolvedLineUnderlineDecoration, unresolvedUnderlineOptions);
  }
}

function clampLine(line: number, lineCount: number): number {
  if (!Number.isFinite(line) || line < 1) {
    return 1;
  }

  if (line > lineCount) {
    return lineCount;
  }

  return line;
}

function buildHoverMarkdown(
  comments: { id: string; status: 'open' | 'resolved'; thread: string[]; createdAt?: string }[]
): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString();
  markdown.isTrusted = {
    enabledCommands: ['stegoExplore.openCommentThread']
  };

  if (comments.length > 1) {
    const unresolvedCount = comments.filter((entry) => entry.status === 'open').length;
    markdown.appendMarkdown(`**${comments.length} comments in this section**`);
    markdown.appendMarkdown(`  \n${unresolvedCount} unresolved, ${comments.length - unresolvedCount} resolved`);
  }

  comments.forEach((comment, index) => {
    const encoded = encodeURIComponent(JSON.stringify([comment.id]));
    const commandUri = vscode.Uri.parse(`command:stegoExplore.openCommentThread?${encoded}`);
    const latest = parseThreadEntry(comment.thread[comment.thread.length - 1] ?? '');
    const status = comment.status === 'open' ? 'Unresolved' : 'Resolved';
    const timestampSource = comment.createdAt || latest.timestamp;
    const timestamp = timestampSource
      ? escapeMarkdown(dayjs(timestampSource).fromNow())
      : 'Unknown time';
    const author = escapeMarkdown(latest.author || 'Unknown');

    markdown.appendMarkdown(`\n\n**${author}** · ${status} · _${timestamp}_  \n`);

    const message = latest.message?.trim() || '(No message)';
    for (const messageLine of message.split(/\r?\n/)) {
      markdown.appendMarkdown(`${escapeMarkdown(messageLine)}  \n`);
    }

    markdown.appendMarkdown(`[Open in sidebar](${commandUri.toString()})`);

    if (index < comments.length - 1) {
      markdown.appendMarkdown('\n\n---');
    }
  });

  return markdown;
}

function buildOverlapGroups<T extends { range: vscode.Range }>(entries: T[]): T[][] {
  const groups: T[][] = [];
  const visited = new Set<number>();

  for (let i = 0; i < entries.length; i += 1) {
    if (visited.has(i)) {
      continue;
    }

    const group: T[] = [];
    const stack: number[] = [i];
    visited.add(i);

    while (stack.length > 0) {
      const currentIndex = stack.pop();
      if (currentIndex === undefined) {
        continue;
      }

      const current = entries[currentIndex];
      group.push(current);

      for (let nextIndex = 0; nextIndex < entries.length; nextIndex += 1) {
        if (visited.has(nextIndex)) {
          continue;
        }

        const next = entries[nextIndex];
        if (current.range.intersection(next.range)) {
          visited.add(nextIndex);
          stack.push(nextIndex);
        }
      }
    }

    group.sort((a, b) => a.range.start.compareTo(b.range.start));
    groups.push(group);
  }

  return groups;
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

function escapeMarkdown(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

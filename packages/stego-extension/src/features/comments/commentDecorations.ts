import * as vscode from 'vscode';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { loadCommentDocumentState } from './commentStore';

dayjs.extend(relativeTime);

export class CommentDecorationsService implements vscode.Disposable {
  private readonly unresolvedDecoration: vscode.TextEditorDecorationType;
  private readonly resolvedDecoration: vscode.TextEditorDecorationType;
  private readonly lineUnderlineDecoration: vscode.TextEditorDecorationType;

  constructor(private readonly extensionUri: vscode.Uri) {
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
  }

  public dispose(): void {
    this.clearAll();
    this.unresolvedDecoration.dispose();
    this.resolvedDecoration.dispose();
    this.lineUnderlineDecoration.dispose();
  }

  public clearAll(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      editor.setDecorations(this.unresolvedDecoration, []);
      editor.setDecorations(this.resolvedDecoration, []);
      editor.setDecorations(this.lineUnderlineDecoration, []);
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

    const state = loadCommentDocumentState(editor.document.getText());
    if (state.errors.length > 0 || state.comments.length === 0) {
      editor.setDecorations(this.unresolvedDecoration, []);
      editor.setDecorations(this.resolvedDecoration, []);
      editor.setDecorations(this.lineUnderlineDecoration, []);
      return;
    }

    type CommentEntry = {
      id: string;
      status: 'open' | 'resolved';
      thread: string[];
      underlineStartLine?: number;
      underlineStartCol?: number;
      underlineEndLine?: number;
      underlineEndCol?: number;
    };

    const byLine = new Map<number, CommentEntry[]>();
    for (const comment of state.comments) {
      const resolvedAnchor = state.anchorsById.get(comment.id);
      const line = clampLine(resolvedAnchor?.line ?? 1, editor.document.lineCount);
      const bucket = byLine.get(line) ?? [];
      bucket.push({
        id: comment.id,
        status: comment.status,
        thread: [...comment.thread],
        underlineStartLine: resolvedAnchor?.underlineStartLine,
        underlineStartCol: resolvedAnchor?.underlineStartCol,
        underlineEndLine: resolvedAnchor?.underlineEndLine,
        underlineEndCol: resolvedAnchor?.underlineEndCol
      });
      byLine.set(line, bucket);
    }

    const unresolvedOptions: vscode.DecorationOptions[] = [];
    const resolvedOptions: vscode.DecorationOptions[] = [];
    const underlineOptions: vscode.DecorationOptions[] = [];

    for (const [line, comments] of byLine.entries()) {
      const hasUnresolved = comments.some((entry) => entry.status === 'open');
      const hover = buildHoverMarkdown(comments);
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

      // Build individual underline ranges per comment
      for (const entry of comments) {
        let textRange: vscode.Range;
        if (
          entry.underlineStartLine !== undefined &&
          entry.underlineStartCol !== undefined &&
          entry.underlineEndLine !== undefined &&
          entry.underlineEndCol !== undefined
        ) {
          const startLine = clampLine(entry.underlineStartLine, editor.document.lineCount) - 1;
          const endLine = clampLine(entry.underlineEndLine, editor.document.lineCount) - 1;
          textRange = new vscode.Range(
            new vscode.Position(startLine, entry.underlineStartCol),
            new vscode.Position(endLine, entry.underlineEndCol)
          );
        } else {
          const lineTextLength = editor.document.lineAt(line - 1).text.length;
          textRange = new vscode.Range(
            new vscode.Position(line - 1, 0),
            new vscode.Position(line - 1, lineTextLength)
          );
        }

        underlineOptions.push({
          range: textRange,
          hoverMessage: hover
        });
      }
    }

    editor.setDecorations(this.unresolvedDecoration, unresolvedOptions);
    editor.setDecorations(this.resolvedDecoration, resolvedOptions);
    editor.setDecorations(this.lineUnderlineDecoration, underlineOptions);
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
  comments: { id: string; status: 'open' | 'resolved'; thread: string[] }[]
): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString();
  markdown.isTrusted = {
    enabledCommands: ['stegoBible.openCommentThread']
  };

  const unresolvedCount = comments.filter((entry) => entry.status === 'open').length;
  markdown.appendMarkdown(`**${comments.length} comment${comments.length === 1 ? '' : 's'} on this line**`);
  markdown.appendMarkdown(`  \n${unresolvedCount} unresolved, ${comments.length - unresolvedCount} resolved\n\n`);

  for (const comment of comments) {
    const encoded = encodeURIComponent(JSON.stringify([comment.id]));
    const commandUri = vscode.Uri.parse(`command:stegoBible.openCommentThread?${encoded}`);
    const status = comment.status === 'open' ? 'unresolved' : 'resolved';
    markdown.appendMarkdown(`- [${escapeMarkdown(comment.id)}](${commandUri.toString()}) (${status})\n`);

    if (comment.thread.length === 0) {
      markdown.appendMarkdown(`\n> _(No thread messages yet)_\n`);
      continue;
    }

    for (const threadEntry of comment.thread) {
      const parsed = parseThreadEntry(threadEntry);
      const timestamp = parsed.timestamp
        ? escapeMarkdown(dayjs(parsed.timestamp).fromNow())
        : 'Unknown time';
      const author = escapeMarkdown(parsed.author || 'Unknown');
      markdown.appendMarkdown(`\n> _${timestamp} | ${author}_\n>\n`);
      const messageLines = (parsed.message || '(No message)').split(/\r?\n/);
      for (const messageLine of messageLines) {
        markdown.appendMarkdown(`> ${escapeMarkdown(messageLine)}\n`);
      }
      markdown.appendMarkdown('>\n');
    }
  }

  return markdown;
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

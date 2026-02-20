import * as vscode from 'vscode';
import { loadCommentDocumentState } from './commentStore';

export class CommentDecorationsService implements vscode.Disposable {
  private readonly openDecoration: vscode.TextEditorDecorationType;
  private readonly resolvedDecoration: vscode.TextEditorDecorationType;
  private readonly lineUnderlineDecoration: vscode.TextEditorDecorationType;

  constructor(private readonly extensionUri: vscode.Uri) {
    this.openDecoration = vscode.window.createTextEditorDecorationType({
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
    this.openDecoration.dispose();
    this.resolvedDecoration.dispose();
    this.lineUnderlineDecoration.dispose();
  }

  public clearAll(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      editor.setDecorations(this.openDecoration, []);
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
      editor.setDecorations(this.openDecoration, []);
      editor.setDecorations(this.resolvedDecoration, []);
      editor.setDecorations(this.lineUnderlineDecoration, []);
      return;
    }

    const byLine = new Map<number, { id: string; status: 'open' | 'resolved'; thread: string[] }[]>();
    for (const comment of state.comments) {
      const resolvedAnchor = state.anchorsById.get(comment.id);
      const line = clampLine(resolvedAnchor?.line ?? 1, editor.document.lineCount);
      const bucket = byLine.get(line) ?? [];
      bucket.push({
        id: comment.id,
        status: comment.status,
        thread: [...comment.thread]
      });
      byLine.set(line, bucket);
    }

    const openOptions: vscode.DecorationOptions[] = [];
    const resolvedOptions: vscode.DecorationOptions[] = [];
    const underlineOptions: vscode.DecorationOptions[] = [];

    for (const [line, comments] of byLine.entries()) {
      const hasOpen = comments.some((entry) => entry.status === 'open');
      const hover = buildHoverMarkdown(comments);
      const lineTextLength = editor.document.lineAt(line - 1).text.length;
      const iconRange = new vscode.Range(
        new vscode.Position(line - 1, 0),
        new vscode.Position(line - 1, 0)
      );
      const textRange = new vscode.Range(
        new vscode.Position(line - 1, 0),
        new vscode.Position(line - 1, lineTextLength)
      );
      const option: vscode.DecorationOptions = { range: iconRange };
      const underlineOption: vscode.DecorationOptions = {
        range: textRange,
        hoverMessage: hover
      };

      if (hasOpen) {
        openOptions.push(option);
      } else {
        resolvedOptions.push(option);
      }
      underlineOptions.push(underlineOption);
    }

    editor.setDecorations(this.openDecoration, openOptions);
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

  const openCount = comments.filter((entry) => entry.status === 'open').length;
  markdown.appendMarkdown(`**${comments.length} comment${comments.length === 1 ? '' : 's'} on this line**`);
  markdown.appendMarkdown(`  \n${openCount} open, ${comments.length - openCount} resolved\n\n`);

  for (const comment of comments) {
    const encoded = encodeURIComponent(JSON.stringify([comment.id]));
    const commandUri = vscode.Uri.parse(`command:stegoBible.openCommentThread?${encoded}`);
    const status = comment.status === 'open' ? 'open' : 'resolved';
    markdown.appendMarkdown(`- [${escapeMarkdown(comment.id)}](${commandUri.toString()}) (${status})\n`);

    if (comment.thread.length === 0) {
      markdown.appendMarkdown(`\n> _(No thread messages yet)_\n`);
      continue;
    }

    for (const threadEntry of comment.thread) {
      const parsed = parseThreadEntry(threadEntry);
      const timestamp = escapeMarkdown(parsed.timestamp || 'Unknown time');
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

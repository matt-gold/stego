import * as vscode from 'vscode';
import { STRINGS } from '../../shared/strings';
import { getConfig } from '../project/projectConfig';
import { getFrontmatterLineRange, getStegoCommentsLineRange } from '../metadata/frontmatterParse';

const AUTO_FOLD_SUPPRESSION_MS = 4000;
const autoFoldSuppressedUntilByDocument = new Map<string, number>();

export function suppressAutoFoldFrontmatterForDocument(documentUri: vscode.Uri, durationMs = AUTO_FOLD_SUPPRESSION_MS): void {
  const ttl = Math.max(0, durationMs);
  const key = documentUri.toString();
  const suppressedUntil = Date.now() + ttl;
  autoFoldSuppressedUntilByDocument.set(key, suppressedUntil);
  setTimeout(() => {
    const current = autoFoldSuppressedUntilByDocument.get(key);
    if (current === suppressedUntil) {
      autoFoldSuppressedUntilByDocument.delete(key);
    }
  }, ttl + 50);
}

function shouldSuppressAutoFoldForDocument(documentUri: vscode.Uri): boolean {
  const key = documentUri.toString();
  const suppressedUntil = autoFoldSuppressedUntilByDocument.get(key);
  if (suppressedUntil === undefined) {
    return false;
  }

  if (Date.now() <= suppressedUntil) {
    return true;
  }

  autoFoldSuppressedUntilByDocument.delete(key);
  return false;
}

export async function maybeAutoFoldFrontmatter(editor: vscode.TextEditor | undefined): Promise<void> {
  if (!editor || editor.document.languageId !== 'markdown') {
    return;
  }

  if (shouldSuppressAutoFoldForDocument(editor.document.uri)) {
    return;
  }

  if (!getConfig('editor', editor.document.uri).get<boolean>('autoFoldFrontmatter', true)) {
    return;
  }

  const range = getFrontmatterLineRange(editor.document);
  const commentsRange = getStegoCommentsLineRange(editor.document);
  if ((!range && !commentsRange) || vscode.window.activeTextEditor !== editor) {
    return;
  }

  const selectionLines: number[] = [];
  if (range) {
    selectionLines.push(range.start);
  }
  if (commentsRange) {
    selectionLines.push(commentsRange.start);
  }

  await vscode.commands.executeCommand('editor.fold', {
    selectionLines
  });
}

export async function toggleFrontmatterFold(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'markdown') {
    void vscode.window.showWarningMessage(STRINGS.foldMarkdownWarning);
    return;
  }

  const range = getFrontmatterLineRange(editor.document);
  if (!range) {
    void vscode.window.showInformationMessage(STRINGS.noFrontmatterInfo);
    return;
  }

  await vscode.commands.executeCommand('editor.toggleFold', {
    selectionLines: [range.start]
  });
}

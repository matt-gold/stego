import * as vscode from 'vscode';
import { STRINGS } from '../../shared/strings';
import { getConfig } from '../project/projectConfig';
import { getFrontmatterLineRange, getStegoCommentsLineRange } from '../metadata/frontmatterParse';

export async function maybeAutoFoldFrontmatter(editor: vscode.TextEditor | undefined): Promise<void> {
  if (!editor || editor.document.languageId !== 'markdown') {
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

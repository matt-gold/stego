import * as vscode from 'vscode';
import { STRINGS } from '../../shared/strings';
import { getFrontmatterLineRange } from '../metadata';

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

import * as vscode from 'vscode';
import { STRINGS } from '../../shared/strings';
import { getConfig } from '../project/projectConfig';
import { getFrontmatterLineRange } from '../metadata/frontmatterParse';

export async function maybeAutoFoldFrontmatter(editor: vscode.TextEditor | undefined): Promise<void> {
  if (!editor || editor.document.languageId !== 'markdown') {
    return;
  }

  if (!getConfig(editor.document.uri).get<boolean>('autoFoldFrontmatter', true)) {
    return;
  }

  const range = getFrontmatterLineRange(editor.document);
  if (!range || vscode.window.activeTextEditor !== editor) {
    return;
  }

  await vscode.commands.executeCommand('editor.fold', {
    selectionLines: [range.start]
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

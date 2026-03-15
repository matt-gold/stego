import * as path from 'path';
import * as vscode from 'vscode';
import { errorToMessage } from '../../shared/errors';
import type { LeafTargetRecord } from '../../shared/types';
import { getConfig } from '../project';

export function resolveTarget(id: string, record: LeafTargetRecord | undefined, document: vscode.TextDocument): vscode.Uri | undefined {
  const config = getConfig('links', document.uri);

  if (record?.url) {
    const urlUri = vscode.Uri.parse(record.url);
    return record.anchor ? urlUri.with({ fragment: record.anchor }) : urlUri;
  }

  if (record?.path) {
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!folder) {
      return undefined;
    }

    const resolvedPath = path.isAbsolute(record.path)
      ? record.path
      : path.join(folder.uri.fsPath, record.path);
    const fileUri = vscode.Uri.file(resolvedPath);
    return record.anchor ? fileUri.with({ fragment: record.anchor }) : fileUri;
  }

  const baseUrl = config.get<string>('definitionBaseUrl', '').trim().replace(/\/+$/, '');
  if (baseUrl.length > 0) {
    return vscode.Uri.parse(`${baseUrl}/${encodeURIComponent(id)}`);
  }

  return undefined;
}

export function createExploreIdentifierCommandUri(id: string): vscode.Uri {
  const args = encodeURIComponent(JSON.stringify([id.toUpperCase()]));
  return vscode.Uri.parse(`command:stegoExplore.exploreIdentifier?${args}`);
}

export async function openLineInActiveDocument(line: number): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'markdown') {
    return;
  }

  const safeLine = Math.max(1, Math.min(line, editor.document.lineCount));
  const position = new vscode.Position(safeLine - 1, 0);
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.AtTop);
}

export async function openBacklinkFile(filePath: string, line: number): Promise<void> {
  const targetUri = vscode.Uri.file(filePath);
  const document = await vscode.workspace.openTextDocument(targetUri);
  const editor = await vscode.window.showTextDocument(document);
  const safeLine = Math.max(1, Math.min(line, document.lineCount));
  const position = new vscode.Position(safeLine - 1, 0);
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.AtTop);
}

export async function openExternalLink(rawUrl: string, basePath?: string): Promise<void> {
  const url = rawUrl.trim();
  if (!url) {
    return;
  }

  if (url.startsWith('//')) {
    try {
      await vscode.env.openExternal(vscode.Uri.parse(`https:${url}`, true));
      return;
    } catch {
      void vscode.window.showInformationMessage(`Could not open link: ${rawUrl}`);
      return;
    }
  }

  const schemeMatch = url.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    if (scheme === 'http' || scheme === 'https') {
      await vscode.env.openExternal(vscode.Uri.parse(url, true));
      return;
    }

    if (scheme === 'file') {
      try {
        await vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(url, true));
      } catch {
        void vscode.window.showInformationMessage(`Could not open link: ${rawUrl}`);
      }
      return;
    }

    void vscode.window.showWarningMessage(`Blocked unsupported link scheme '${scheme}'.`);
    return;
  }

  const [rawFilePart, rawFragmentPart] = url.split('#', 2);
  const filePart = rawFilePart.trim();
  const fragment = rawFragmentPart?.trim();
  const baseFile = resolveLinkBaseFilePath(basePath);
  const fallbackBaseFile = resolveLinkBaseFilePath();
  const effectiveBaseFile = baseFile ?? fallbackBaseFile;

  if (!filePart) {
    if (!effectiveBaseFile) {
      void vscode.window.showInformationMessage(`Could not resolve anchor link: ${rawUrl}`);
      return;
    }

    const target = vscode.Uri.file(effectiveBaseFile).with({ fragment: fragment ?? '' });
    await vscode.commands.executeCommand('vscode.open', target);
    return;
  }

  const baseDir = effectiveBaseFile ? path.dirname(effectiveBaseFile) : undefined;
  const resolvedFile = path.isAbsolute(filePart)
    ? filePart
    : baseDir
      ? path.resolve(baseDir, filePart)
      : path.resolve(filePart);
  const fileUri = vscode.Uri.file(resolvedFile);
  const target = fragment ? fileUri.with({ fragment }) : fileUri;

  try {
    await vscode.commands.executeCommand('vscode.open', target);
    return;
  } catch {
    void vscode.window.showInformationMessage(`Could not open link: ${rawUrl}`);
  }
}

export function resolveLinkBaseFilePath(basePath?: string): string | undefined {
  if (basePath && path.isAbsolute(basePath)) {
    return basePath;
  }

  const editor = vscode.window.activeTextEditor;
  if (editor?.document.uri.scheme === 'file') {
    return editor.document.uri.fsPath;
  }

  return undefined;
}

export async function openMarkdownPreviewForActiveDocument(document: vscode.TextDocument | undefined): Promise<void> {
  if (!document) {
    return;
  }

  try {
    await vscode.commands.executeCommand('markdown.showPreview', document.uri);
  } catch (error) {
    void vscode.window.showErrorMessage(`Could not open Markdown preview: ${errorToMessage(error)}`);
  }
}

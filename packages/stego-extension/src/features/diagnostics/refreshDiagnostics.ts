import * as vscode from 'vscode';
import { DEFAULT_IDENTIFIER_PATTERN } from '../../shared/constants';
import { normalizeFsPath } from '../../shared/path';
import { collectIdentifiers } from '../identifiers/collectIdentifiers';
import { getConfig, getResolvedIndexPath } from '../project/projectConfig';
import { SpineIndexService } from '../indexing/spineIndexService';
import { isCommentIdentifier } from '../comments/commentIds';

export async function refreshDiagnosticsForDocument(
  document: vscode.TextDocument,
  indexService: SpineIndexService,
  diagnostics: vscode.DiagnosticCollection
): Promise<void> {
  if (document.languageId !== 'markdown') {
    diagnostics.delete(document.uri);
    return;
  }

  const spineConfig = getConfig('spine', document.uri);
  if (!spineConfig.get<boolean>('reportUnknownIdentifiers', true)) {
    diagnostics.delete(document.uri);
    return;
  }

  const pattern = spineConfig.get<string>('identifierPattern', DEFAULT_IDENTIFIER_PATTERN);
  const includeFences = getConfig('editor', document.uri).get<boolean>('linkInCodeFences', false);
  const matches = collectIdentifiers(document, pattern, includeFences);
  if (matches.length === 0) {
    diagnostics.set(document.uri, []);
    return;
  }

  const index = await indexService.loadForDocument(document);
  const documentDiagnostics: vscode.Diagnostic[] = [];

  for (const match of matches) {
    if (isCommentIdentifier(match.id)) {
      continue;
    }

    if (index.has(match.id)) {
      continue;
    }

    const diagnostic = new vscode.Diagnostic(
      match.range,
      `Unknown Spine identifier '${match.id}'. Add the category in project.json (spineCategories) and define the identifier in spine/<notesFile>.md.`,
      vscode.DiagnosticSeverity.Warning
    );
    diagnostic.source = 'stegoSpine';
    documentDiagnostics.push(diagnostic);
  }

  diagnostics.set(document.uri, documentDiagnostics);
}

export async function refreshVisibleMarkdownDocuments(
  indexService: SpineIndexService,
  diagnostics: vscode.DiagnosticCollection
): Promise<void> {
  const documents = vscode.workspace.textDocuments.filter((document) => document.languageId === 'markdown');
  await Promise.all(documents.map((document) => refreshDiagnosticsForDocument(document, indexService, diagnostics)));
}

export function isAnyWorkspaceIndexFile(uri: vscode.Uri): boolean {
  if (uri.scheme !== 'file') {
    return false;
  }

  const folders = vscode.workspace.workspaceFolders ?? [];
  for (const folder of folders) {
    const indexPath = getResolvedIndexPath(folder);
    if (!indexPath) {
      continue;
    }

    if (normalizeFsPath(indexPath) === normalizeFsPath(uri.fsPath)) {
      return true;
    }
  }

  return false;
}

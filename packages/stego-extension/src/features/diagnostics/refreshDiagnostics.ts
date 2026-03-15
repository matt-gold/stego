import * as vscode from 'vscode';
import { DEFAULT_IDENTIFIER_PATTERN } from '../../shared/constants';
import { isCommentIdentifier } from '../comments';
import { collectIdentifiers } from '../identifiers';
import { LeafIndexService } from '../indexing';
import { getConfig } from '../project';

export async function refreshDiagnosticsForDocument(
  document: vscode.TextDocument,
  indexService: LeafIndexService,
  diagnostics: vscode.DiagnosticCollection
): Promise<void> {
  if (document.languageId !== 'markdown') {
    diagnostics.delete(document.uri);
    return;
  }

  const linkConfig = getConfig('links', document.uri);
  if (!linkConfig.get<boolean>('reportUnknownIdentifiers', true)) {
    diagnostics.delete(document.uri);
    return;
  }

  const pattern = linkConfig.get<string>('identifierPattern', DEFAULT_IDENTIFIER_PATTERN);
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
      `Unknown leaf identifier '${match.id}'. Define it in a content leaf with frontmatter id.`,
      vscode.DiagnosticSeverity.Warning
    );
    diagnostic.source = 'stego';
    documentDiagnostics.push(diagnostic);
  }

  diagnostics.set(document.uri, documentDiagnostics);
}

export async function refreshVisibleMarkdownDocuments(
  indexService: LeafIndexService,
  diagnostics: vscode.DiagnosticCollection
): Promise<void> {
  const documents = vscode.workspace.textDocuments.filter((document) => document.languageId === 'markdown');
  await Promise.all(documents.map((document) => refreshDiagnosticsForDocument(document, indexService, diagnostics)));
}

import * as vscode from 'vscode';
import { METADATA_VIEW_ID } from './shared/constants';
import { maybeAutoFoldFrontmatter, toggleFrontmatterFold } from './features/commands/frontmatterFold';
import { runProjectBuildWorkflow } from './features/commands/buildWorkflow';
import { runProjectGateStageWorkflow } from './features/commands/stageCheckWorkflow';
import { refreshDiagnosticsForDocument, refreshVisibleMarkdownDocuments, isAnyWorkspaceIndexFile } from './features/diagnostics/refreshDiagnostics';
import { createDocumentLinkProvider } from './features/identifiers/documentLinks';
import { createHoverProvider } from './features/identifiers/hover';
import { BibleIndexService } from './features/indexing/bibleIndexService';
import { ReferenceUsageIndexService } from './features/indexing/referenceUsageIndexService';
import { getFrontmatterLineRange } from './features/metadata/frontmatterParse';
import { isProjectFile } from './features/project/projectConfig';
import { MetadataSidebarProvider } from './features/sidebar/sidebarProvider';

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection('stegoBible');
  const indexService = new BibleIndexService();
  const referenceUsageService = new ReferenceUsageIndexService();
  const sidebarProvider = new MetadataSidebarProvider(
    context.extensionUri,
    indexService,
    referenceUsageService,
    diagnostics
  );

  const selector: vscode.DocumentSelector = [{ language: 'markdown' }];

  context.subscriptions.push(
    diagnostics,
    vscode.window.registerWebviewViewProvider(METADATA_VIEW_ID, sidebarProvider),
    vscode.commands.registerCommand('stegoBible.exploreIdentifier', async (rawId: unknown) => {
      if (typeof rawId !== 'string' || rawId.trim().length === 0) {
        return;
      }

      await sidebarProvider.focusIdentifier(rawId);
    }),
    vscode.languages.registerDocumentLinkProvider(selector, createDocumentLinkProvider(indexService)),
    vscode.languages.registerHoverProvider(selector, createHoverProvider(indexService)),
    vscode.languages.registerFoldingRangeProvider(selector, {
      provideFoldingRanges(document): vscode.FoldingRange[] {
        const range = getFrontmatterLineRange(document);
        if (!range) {
          return [];
        }

        return [new vscode.FoldingRange(range.start, range.end, vscode.FoldingRangeKind.Region)];
      }
    }),
    vscode.commands.registerCommand('stegoBible.reloadIndex', async () => {
      indexService.clear();
      referenceUsageService.clear();
      await refreshVisibleMarkdownDocuments(indexService, diagnostics);
      await sidebarProvider.refresh();
      void vscode.window.showInformationMessage('Stego Bible index rebuilt.');
    }),
    vscode.commands.registerCommand('stegoBible.runBuild', async () => {
      await runProjectBuildWorkflow();
    }),
    vscode.commands.registerCommand('stegoBible.runGateStage', async () => {
      await runProjectGateStageWorkflow();
    }),
    vscode.commands.registerCommand('stegoBible.toggleFrontmatter', async () => {
      await toggleFrontmatterFold();
    }),
    vscode.workspace.onDidOpenTextDocument((document) => {
      void refreshDiagnosticsForDocument(document, indexService, diagnostics);
      if (document === vscode.window.activeTextEditor?.document) {
        void maybeAutoFoldFrontmatter(vscode.window.activeTextEditor);
      }
      void sidebarProvider.refresh();
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      void refreshDiagnosticsForDocument(event.document, indexService, diagnostics);
      if (event.document === vscode.window.activeTextEditor?.document) {
        void sidebarProvider.refresh();
      }
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      const shouldReloadIndex = isAnyWorkspaceIndexFile(document.uri)
        || isProjectFile(document.uri)
        || document.languageId === 'markdown';
      if (shouldReloadIndex) {
        indexService.clear();
        referenceUsageService.clear();
        void refreshVisibleMarkdownDocuments(indexService, diagnostics);
      } else {
        void refreshDiagnosticsForDocument(document, indexService, diagnostics);
      }
      void sidebarProvider.refresh();
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      diagnostics.delete(document.uri);
      void sidebarProvider.refresh();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('stegoBible')) {
        indexService.clear();
        referenceUsageService.clear();
        void refreshVisibleMarkdownDocuments(indexService, diagnostics);
        void maybeAutoFoldFrontmatter(vscode.window.activeTextEditor);
        void sidebarProvider.refresh();
      }
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      void maybeAutoFoldFrontmatter(editor);
      void sidebarProvider.refresh();
    })
  );

  void refreshVisibleMarkdownDocuments(indexService, diagnostics);
  void sidebarProvider.refresh();
  void maybeAutoFoldFrontmatter(vscode.window.activeTextEditor);
}

export function deactivate(): void {
  // No-op.
}

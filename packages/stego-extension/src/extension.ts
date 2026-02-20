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
import { getFrontmatterLineRange, getStegoCommentsLineRange } from './features/metadata/frontmatterParse';
import { getActiveMarkdownDocument } from './features/metadata/frontmatterEdit';
import { getConfig, isProjectFile } from './features/project/projectConfig';
import { MetadataSidebarProvider } from './features/sidebar/sidebarProvider';
import { CommentDecorationsService } from './features/comments/commentDecorations';
import { addCommentAtSelection } from './features/comments/commentStore';

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
  const commentDecorations = new CommentDecorationsService(context.extensionUri);

  const selector: vscode.DocumentSelector = [{ language: 'markdown' }];

  context.subscriptions.push(
    diagnostics,
    commentDecorations,
    vscode.window.registerWebviewViewProvider(METADATA_VIEW_ID, sidebarProvider),
    vscode.commands.registerCommand('stegoBible.exploreIdentifier', async (rawId: unknown) => {
      if (typeof rawId !== 'string' || rawId.trim().length === 0) {
        return;
      }

      await sidebarProvider.focusIdentifier(rawId);
    }),
    vscode.commands.registerCommand('stegoBible.openCommentThread', async (rawId: unknown) => {
      if (typeof rawId !== 'string' || rawId.trim().length === 0) {
        return;
      }

      await sidebarProvider.focusComment(rawId);
    }),
    vscode.commands.registerCommand('stegoBible.addComment', async () => {
      const document = getActiveMarkdownDocument(true);
      if (!document) {
        return;
      }

      const message = await vscode.window.showInputBox({
        prompt: 'New comment',
        placeHolder: 'Write your comment'
      });
      if (message === undefined) {
        return;
      }

      const author = getConfig(document.uri).get<string>('commentAuthor', '') ?? '';
      const result = await addCommentAtSelection(document, message, author);
      if (result.warning) {
        void vscode.window.showWarningMessage(result.warning);
        return;
      }

      if (result.id) {
        await sidebarProvider.focusComment(result.id);
      } else {
        await sidebarProvider.refresh();
      }
      commentDecorations.refreshVisibleEditors();
    }),
    vscode.languages.registerDocumentLinkProvider(selector, createDocumentLinkProvider(indexService)),
    vscode.languages.registerHoverProvider(selector, createHoverProvider(indexService)),
    vscode.languages.registerFoldingRangeProvider(selector, {
      provideFoldingRanges(document): vscode.FoldingRange[] {
        const ranges: vscode.FoldingRange[] = [];
        const frontmatterRange = getFrontmatterLineRange(document);
        const commentsRange = getStegoCommentsLineRange(document);

        if (frontmatterRange) {
          ranges.push(new vscode.FoldingRange(frontmatterRange.start, frontmatterRange.end, vscode.FoldingRangeKind.Region));
        }
        if (commentsRange) {
          ranges.push(new vscode.FoldingRange(commentsRange.start, commentsRange.end, vscode.FoldingRangeKind.Region));
        }

        return ranges;
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
      commentDecorations.refreshVisibleEditors();
      void sidebarProvider.refresh();
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      void refreshDiagnosticsForDocument(event.document, indexService, diagnostics);
      commentDecorations.refreshVisibleEditors();
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
      commentDecorations.refreshVisibleEditors();
      void sidebarProvider.refresh();
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      diagnostics.delete(document.uri);
      commentDecorations.refreshVisibleEditors();
      void sidebarProvider.refresh();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('stegoBible')) {
        indexService.clear();
        referenceUsageService.clear();
        void refreshVisibleMarkdownDocuments(indexService, diagnostics);
        void maybeAutoFoldFrontmatter(vscode.window.activeTextEditor);
        commentDecorations.refreshVisibleEditors();
        void sidebarProvider.refresh();
      }
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      void maybeAutoFoldFrontmatter(editor);
      commentDecorations.refreshEditor(editor);
      void sidebarProvider.refresh();
    }),
    vscode.window.onDidChangeVisibleTextEditors(() => {
      commentDecorations.refreshVisibleEditors();
    })
  );

  void refreshVisibleMarkdownDocuments(indexService, diagnostics);
  commentDecorations.refreshVisibleEditors();
  void sidebarProvider.refresh();
  void maybeAutoFoldFrontmatter(vscode.window.activeTextEditor);
}

export function deactivate(): void {
  // No-op.
}

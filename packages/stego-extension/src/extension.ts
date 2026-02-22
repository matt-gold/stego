import * as vscode from 'vscode';
import { METADATA_VIEW_ID } from './shared/constants';
import { maybeAutoFoldFrontmatter, toggleFrontmatterFold } from './features/commands/frontmatterFold';
import { runProjectBuildWorkflow } from './features/commands/buildWorkflow';
import { runProjectGateStageWorkflow } from './features/commands/stageCheckWorkflow';
import { runLocalValidateWorkflow } from './features/commands/localValidateWorkflow';
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
import { CommentExcerptTracker } from './features/comments/commentExcerptTracker';
import { addCommentAtSelection, loadCommentDocumentState, persistExcerptUpdates, deleteCommentsByIds } from './features/comments/commentStore';

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
  const excerptTracker = new CommentExcerptTracker();
  const commentDecorations = new CommentDecorationsService(context.extensionUri, excerptTracker);

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

      if (!getConfig('comments', document.uri).get<boolean>('enable', true)) {
        return;
      }

      const message = await vscode.window.showInputBox({
        prompt: 'New comment',
        placeHolder: 'Write your comment'
      });
      if (message === undefined) {
        return;
      }

      const author = getConfig('comments', document.uri).get<string>('author', '') ?? '';
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
      initExcerptTracking(document);
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
      const result = await runProjectBuildWorkflow();
      await sidebarProvider.recordGateWorkflowResult('build', result);
    }),
    vscode.commands.registerCommand('stegoBible.runGateStage', async () => {
      const result = await runProjectGateStageWorkflow();
      await sidebarProvider.recordGateWorkflowResult('stageCheck', result);
    }),
    vscode.commands.registerCommand('stegoBible.runLocalValidate', async () => {
      await runLocalValidateWorkflow();
    }),
    vscode.commands.registerCommand('stegoBible.toggleFrontmatter', async () => {
      await toggleFrontmatterFold();
    }),
    vscode.workspace.onDidOpenTextDocument((document) => {
      void refreshDiagnosticsForDocument(document, indexService, diagnostics);
      if (document === vscode.window.activeTextEditor?.document) {
        void maybeAutoFoldFrontmatter(vscode.window.activeTextEditor);
      }
      initExcerptTracking(document);
      commentDecorations.refreshVisibleEditors();
      void sidebarProvider.refresh();
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.languageId === 'markdown' && event.contentChanges.length > 0) {
        excerptTracker.applyChanges(event.document.uri.toString(), event.contentChanges);
      }
      void refreshDiagnosticsForDocument(event.document, indexService, diagnostics);
      commentDecorations.refreshVisibleEditors();
      if (event.document === vscode.window.activeTextEditor?.document) {
        if (event.document.languageId === 'markdown') {
          sidebarProvider.scheduleRefresh({ mode: 'fast', debounceMs: 180 });
        } else {
          void sidebarProvider.refresh('full');
        }
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

      if (document.languageId === 'markdown') {
        void handleExcerptPersistOnSave(document);
      }

      commentDecorations.refreshVisibleEditors();
      void sidebarProvider.refresh();
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      diagnostics.delete(document.uri);
      excerptTracker.clear(document.uri.toString());
      commentDecorations.refreshVisibleEditors();
      void sidebarProvider.refresh();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('stego')) {
        indexService.clear();
        referenceUsageService.clear();
        void refreshVisibleMarkdownDocuments(indexService, diagnostics);
        void maybeAutoFoldFrontmatter(vscode.window.activeTextEditor);
        const activeDoc = vscode.window.activeTextEditor?.document;
        const commentsEnabled = activeDoc
          ? getConfig('comments', activeDoc.uri).get<boolean>('enable', true) !== false
          : true;
        if (commentsEnabled) {
          commentDecorations.refreshVisibleEditors();
        } else {
          commentDecorations.clearAll();
        }
        void sidebarProvider.refresh();
      }
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      void maybeAutoFoldFrontmatter(editor);
      if (editor?.document) {
        initExcerptTracking(editor.document);
      }
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

  function initExcerptTracking(document: vscode.TextDocument): void {
    if (document.languageId !== 'markdown') {
      return;
    }
    if (!getConfig('comments', document.uri).get<boolean>('enable', true)) {
      return;
    }
    const state = loadCommentDocumentState(document.getText());
    if (state.errors.length === 0) {
      excerptTracker.load(document.uri.toString(), state.comments);
    }
  }

  async function handleExcerptPersistOnSave(document: vscode.TextDocument): Promise<void> {
    const uri = document.uri.toString();
    if (!getConfig('comments', document.uri).get<boolean>('enable', true)) {
      return;
    }

    // Handle auto-deletion of comments whose excerpts were fully deleted
    const state = loadCommentDocumentState(document.getText());
    const deletedIds = excerptTracker.getDeletedThreadIds(uri, state.comments);
    if (deletedIds.length > 0) {
      const removed = await deleteCommentsByIds(document, deletedIds, excerptTracker);
      if (removed > 0) {
        void vscode.window.showInformationMessage(
          `Removed ${removed} comment${removed === 1 ? '' : 's'} (excerpt deleted).`
        );
        commentDecorations.refreshVisibleEditors();
        void sidebarProvider.refresh();
        return;
      }
    }

    // Persist tracked excerpt coordinate updates
    await persistExcerptUpdates(document, excerptTracker);
  }
}

export function deactivate(): void {
  // No-op.
}

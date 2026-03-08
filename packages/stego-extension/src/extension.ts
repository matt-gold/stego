import * as vscode from 'vscode';
import { END_SENTINEL, START_SENTINEL } from '../../shared/src/domain/comments';
import { METADATA_VIEW_ID } from './shared/constants';
import {
  runInsertImageWorkflow,
  maybeAutoFoldFrontmatter,
  runLocalValidateWorkflow,
  runNewManuscriptWorkflow,
  runNewProjectWorkflow,
  runOpenProjectWorkflow,
  runProjectBuildWorkflow,
  runProjectGateStageWorkflow,
  toggleFrontmatterFold
} from './features/commands';
import { refreshDiagnosticsForDocument, refreshVisibleMarkdownDocuments } from './features/diagnostics';
import { createDocumentLinkProvider, createHoverProvider } from './features/identifiers';
import { ReferenceUsageIndexService, SpineIndexService } from './features/indexing';
import { getActiveMarkdownDocument, getFrontmatterLineRange, getStegoCommentsLineRange } from './features/metadata';
import { detectStegoOpenMode, getConfig, isProjectFile } from './features/project';
import { MetadataSidebarProvider } from './features/sidebar';
import {
  addCommentAtSelection,
  clearCachedCommentState,
  CommentDecorationsService,
  CommentExcerptTracker,
  persistExcerptUpdates,
  refreshCommentState
} from './features/comments';

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection('stegoSpine');
  const indexService = new SpineIndexService();
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

  const refreshOpenModeContext = async (): Promise<void> => {
    const mode = await detectStegoOpenMode();
    await vscode.commands.executeCommand('setContext', 'stegoSpine.isStegoWorkspace', mode === 'workspace');
  };

  context.subscriptions.push(
    diagnostics,
    commentDecorations,
    vscode.window.registerWebviewViewProvider(METADATA_VIEW_ID, sidebarProvider),
    vscode.commands.registerCommand('stegoSpine.exploreIdentifier', async (rawId: unknown) => {
      if (typeof rawId !== 'string' || rawId.trim().length === 0) {
        return;
      }

      await sidebarProvider.focusIdentifier(rawId);
    }),
    vscode.commands.registerCommand('stegoSpine.openCommentThread', async (rawId: unknown) => {
      if (typeof rawId !== 'string' || rawId.trim().length === 0) {
        return;
      }

      await sidebarProvider.focusComment(rawId);
    }),
    vscode.commands.registerCommand('stegoSpine.addComment', async () => {
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
      await syncCommentStateAndTracker(document, false);
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
    vscode.commands.registerCommand('stegoSpine.reloadIndex', async () => {
      indexService.clear();
      referenceUsageService.clear();
      await refreshVisibleMarkdownDocuments(indexService, diagnostics);
      await sidebarProvider.refresh();
      void vscode.window.showInformationMessage('Stego Spine index rebuilt.');
    }),
    vscode.commands.registerCommand('stegoSpine.runBuild', async () => {
      const result = await runProjectBuildWorkflow();
      await sidebarProvider.recordGateWorkflowResult('build', result);
    }),
    vscode.commands.registerCommand('stegoSpine.runGateStage', async () => {
      const result = await runProjectGateStageWorkflow();
      await sidebarProvider.recordGateWorkflowResult('stageCheck', result);
    }),
    vscode.commands.registerCommand('stegoSpine.runLocalValidate', async () => {
      await runLocalValidateWorkflow();
    }),
    vscode.commands.registerCommand('stegoSpine.newManuscript', async () => {
      const result = await runNewManuscriptWorkflow();
      if (result.ok) {
        sidebarProvider.expandMetadataPanel();
        await sidebarProvider.refresh();
      }
    }),
    vscode.commands.registerCommand('stegoSpine.insertImage', async () => {
      const result = await runInsertImageWorkflow();
      if (result.ok) {
        await sidebarProvider.refresh();
      }
    }),
    vscode.commands.registerCommand('stegoSpine.newProject', async () => {
      const result = await runNewProjectWorkflow();
      if (result.ok) {
        await sidebarProvider.refresh();
      }
      await refreshOpenModeContext();
    }),
    vscode.commands.registerCommand('stegoSpine.openProject', async () => {
      await runOpenProjectWorkflow();
    }),
    vscode.commands.registerCommand('stegoSpine.toggleFrontmatter', async () => {
      await toggleFrontmatterFold();
    }),
    vscode.workspace.onDidOpenTextDocument((document) => {
      void refreshDiagnosticsForDocument(document, indexService, diagnostics);
      if (document === vscode.window.activeTextEditor?.document) {
        void maybeAutoFoldFrontmatter(vscode.window.activeTextEditor);
      }
      void syncCommentStateAndTracker(document, false);
      commentDecorations.refreshVisibleEditors();
      void sidebarProvider.refresh();
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.languageId === 'markdown' && event.contentChanges.length > 0) {
        excerptTracker.applyChanges(event.document.uri.toString(), event.contentChanges);
      }
      void refreshDiagnosticsForDocument(event.document, indexService, diagnostics);
      commentDecorations.refreshVisibleEditors();
      const commentsChanged = event.document.languageId === 'markdown'
        && event.contentChanges.length > 0
        && changesLikelyAffectCommentAppendix(event);
      if (commentsChanged) {
        void syncCommentStateAndTracker(event.document, false);
      }
      if (event.document === vscode.window.activeTextEditor?.document) {
        if (commentsChanged) {
          return;
        }
        if (event.document.languageId === 'markdown') {
          sidebarProvider.scheduleRefresh({ mode: 'fast', debounceMs: 180 });
        } else {
          void sidebarProvider.refresh('full');
        }
      }
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      const shouldReloadIndex = isProjectFile(document.uri)
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
      clearCachedCommentState(document.uri.toString());
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
        void syncCommentStateAndTracker(editor.document, false);
      }
      commentDecorations.refreshEditor(editor);
      void sidebarProvider.refresh();
    }),
    vscode.window.onDidChangeVisibleTextEditors(() => {
      commentDecorations.refreshVisibleEditors();
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void refreshOpenModeContext();
    })
  );

  void refreshVisibleMarkdownDocuments(indexService, diagnostics);
  commentDecorations.refreshVisibleEditors();
  void sidebarProvider.refresh();
  void refreshOpenModeContext();
  void maybeAutoFoldFrontmatter(vscode.window.activeTextEditor);
  for (const editor of vscode.window.visibleTextEditors) {
    void syncCommentStateAndTracker(editor.document, false);
  }

  async function syncCommentStateAndTracker(document: vscode.TextDocument, showWarning: boolean): Promise<void> {
    if (document.languageId !== 'markdown') {
      return;
    }

    if (!getConfig('comments', document.uri).get<boolean>('enable', true)) {
      return;
    }

    const refreshed = await refreshCommentState(document, { showWarning });
    if (refreshed.state && refreshed.state.parseErrors.length === 0) {
      excerptTracker.load(document.uri.toString(), refreshed.state.comments);
    }

    commentDecorations.refreshVisibleEditors();
    void sidebarProvider.refresh();
  }

  async function handleExcerptPersistOnSave(document: vscode.TextDocument): Promise<void> {
    if (!getConfig('comments', document.uri).get<boolean>('enable', true)) {
      return;
    }

    const syncResult = await persistExcerptUpdates(document, excerptTracker);
    if (syncResult.warning) {
      void vscode.window.showWarningMessage(syncResult.warning);
    }

    if (syncResult.deletedCount > 0) {
      void vscode.window.showInformationMessage(
        `Removed ${syncResult.deletedCount} comment${syncResult.deletedCount === 1 ? '' : 's'} (excerpt deleted).`
      );
    }

    await syncCommentStateAndTracker(document, false);
    commentDecorations.refreshVisibleEditors();
    void sidebarProvider.refresh();
  }

  function changesLikelyAffectCommentAppendix(event: vscode.TextDocumentChangeEvent): boolean {
    const commentsRange = getStegoCommentsLineRange(event.document);

    for (const change of event.contentChanges) {
      if (containsCommentAppendixMarker(change.text)) {
        return true;
      }

      if (commentsRange) {
        const startsBeforeOrAtEnd = change.range.start.line <= commentsRange.end;
        const endsAfterOrAtStart = change.range.end.line >= commentsRange.start;
        if (startsBeforeOrAtEnd && endsAfterOrAtStart) {
          return true;
        }
      }
    }

    return false;
  }

  function containsCommentAppendixMarker(text: string): boolean {
    if (!text) {
      return false;
    }

    const normalizeSentinel = (value: string): string => value.toLowerCase().replace(/\s+/g, '');
    const normalizedText = text.toLowerCase().replace(/\s+/g, '');
    const normalizedStart = normalizeSentinel(START_SENTINEL);
    const normalizedEnd = normalizeSentinel(END_SENTINEL);

    if (normalizedText.includes(normalizedStart) || normalizedText.includes(normalizedEnd)) {
      return true;
    }

    // tolerate extra spacing and case changes in legacy markers
    return /<!--\s*(comment|meta64)\s*:/i.test(text);
  }
}

export function deactivate(): void {
  // No-op.
}

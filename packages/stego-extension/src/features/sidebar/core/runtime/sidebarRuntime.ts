import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fs } from 'fs';
import { CONTENT_DIR, DEFAULT_IDENTIFIER_PATTERN } from '../../../../shared/constants';
import { errorToMessage } from '../../../../shared/errors';
import { asNumber } from '../../../../shared/value';
import type {
  ExplorerRoute,
  ProjectScanContext,
  ProjectBranch,
  ProjectConfigIssue,
  LeafTargetRecord,
  SidebarCommentsState,
  SidebarPinnedExplorerPanel,
  SidebarOverviewGateSnapshot,
  SidebarOverviewState,
  SidebarState,
  SidebarViewTab
} from '../../../../shared/types';
import {
  openMarkdownPreviewCommand,
  resolveStegoCommandInvocation,
  runCommand,
  runInsertImageWorkflow,
  runLocalValidateWorkflow,
  runNewManuscriptWorkflow,
  runProjectBuildWorkflow,
  runProjectGateStageWorkflow,
  suppressAutoFoldFrontmatterForDocument,
  toggleFrontmatterFold,
  type WorkflowRunResult
} from '../../../commands';
import { refreshVisibleMarkdownDocuments } from '../../../diagnostics';
import { ReferenceUsageIndexService, LeafIndexService } from '../../../indexing';
import {
  buildSidebarImageEntries,
  buildStatusControl,
  formatMetadataValue,
  getActiveMarkdownDocument,
  parseMarkdownDocument,
  promptAndAddMetadataArrayItem,
  promptAndAddMetadataField,
  promptAndEditMetadataArrayItem,
  promptAndEditMetadataField,
  promptAndEditImageOverride,
  clearImageOverride,
  removeMetadataArrayItem,
  removeMetadataField,
  setMetadataStatus,
  promptAndFillRequiredMetadata
} from '../../../metadata';
import { collectIdentifierOccurrencesFromLines, extractIdentifierTokensFromValue } from '../../../identifiers';
import { openBacklinkFile, openExternalLink, openLineInActiveDocument } from '../../../navigation';
import {
  PROJECT_HEALTH_CHANNEL,
  findNearestProjectConfig,
  getConfig,
  logProjectHealthIssue,
  collectManuscriptMarkdownFiles,
  resolveCurrentBranchFile
} from '../../../project';
import { buildExplorerState, buildMetadataEntry, buildTocWithBacklinks, collectTocEntries, isManuscriptPath } from '../../tabs/document';
import { normalizeExplorerRoute, isSameExplorerRoute } from '../../tabs/explore';
import { compareOverviewStatus, countOverviewWords } from '../../tabs/overview';
import { renderSidebarShellHtml } from '../../webview';
import {
  parseSidebarInboundMessage,
  type SidebarActionMessage,
  type SidebarHostMessage,
  type SidebarWebviewState
} from '../../protocol';
import { SIDEBAR_ACTION_HANDLERS } from './actionHandlers';
import { SidebarEventBus } from './bus';
import type { SidebarRuntimeEvent } from './events';
import { SidebarEffectRunner } from './effects/runner';
import { projectSidebarState } from './projector/sidebarStateProjector';
import type {
  GateSnapshotByProject,
  OverviewBuildResult,
  OverviewFileCache,
  RefreshMode
} from '../sidebarProvider.types';
import {
  EXPLORER_PIN_LIMIT,
  type ActiveExplorerState,
  type PinnedExplorerEntryState,
  pinExplorerEntry,
  resetActiveExplorerForNewInstance,
  setPinnedExplorerBacklinkFilter,
  togglePinnedExplorerCollapse,
  togglePinnedExplorerBacklinks,
  unpinExplorerEntry
} from '../../tabs/explore';
import {
  addCommentAtSelection,
  buildSidebarCommentsState,
  clearResolvedComments,
  deleteComment,
  getDocumentContentWithoutComments,
  jumpToComment,
  normalizeAuthor,
  readCommentStateForFile,
  replyToComment,
  stripStegoCommentsAppendix,
  toggleCommentResolved
} from '../../../comments';

export class SidebarRuntime implements vscode.WebviewViewProvider {
  private static readonly PIN_LIMIT = EXPLORER_PIN_LIMIT;

  private view?: vscode.WebviewView;
  private webviewReady = false;
  private lastPostedState?: SidebarWebviewState;
  private backlinkFilter = '';
  private metadataEditing = false;
  private activeTab: SidebarViewTab = 'document';
  private readonly tabBackStack: SidebarViewTab[] = [];
  private readonly tabForwardStack: SidebarViewTab[] = [];
  private readonly documentBackStack: SidebarState[] = [];
  private readonly documentForwardStack: SidebarState[] = [];
  private lastObservedActiveEditorPath = '';
  private metadataCollapsed = false;
  private selectedCommentId?: string;
  private explorerRoute: ExplorerRoute = { kind: 'home' };
  private explorerCollapsed = false;
  private readonly explorerBackStack: ExplorerRoute[] = [];
  private readonly explorerForwardStack: ExplorerRoute[] = [];
  private explorerBacklinksExpanded = false;
  private explorerLoadToken = 0;
  private readonly pinnedByProject = new Map<string, PinnedExplorerEntryState[]>();
  private readonly expandedTocBacklinks = new Set<string>();
  private readonly overviewFileCache = new Map<string, OverviewFileCache>();
  private readonly gateSnapshotByProject: GateSnapshotByProject = new Map();
  private readonly bus = new SidebarEventBus<SidebarRuntimeEvent>();
  private readonly effectRunner = new SidebarEffectRunner();
  private readonly stateSubscribers = new Set<(state: SidebarWebviewState) => void>();
  private lastRenderedState?: SidebarState;
  private lastDocumentTabSnapshot?: SidebarState;
  private refreshInFlight = false;
  private refreshNonce = 0;
  private queuedRefreshMode: RefreshMode | undefined;
  private scheduledRefreshMode: RefreshMode | undefined;
  private scheduledRefreshTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly indexService: LeafIndexService,
    private readonly referenceUsageService: ReferenceUsageIndexService,
    private readonly diagnostics: vscode.DiagnosticCollection
  ) {}

  public subscribe(listener: (state: SidebarWebviewState) => void): () => void {
    this.stateSubscribers.add(listener);
    return () => {
      this.stateSubscribers.delete(listener);
    };
  }

  public async focusIdentifier(id: string): Promise<void> {
    const normalized = id.trim().toUpperCase();
    if (!normalized) {
      return;
    }

    this.setActiveTab('explore');
    this.navigateExplorerToRoute({ kind: 'identifier', id: normalized }, { trackHistory: true });
    await this.refresh();
  }

  public async focusComment(id: string): Promise<void> {
    const normalized = id.trim().toUpperCase();
    if (!normalized) {
      return;
    }

    this.setActiveTab('document');
    this.selectedCommentId = normalized;
    await this.refresh();
  }

  public expandMetadataPanel(): void {
    this.metadataCollapsed = false;
  }

  private setActiveTab(tab: SidebarViewTab, options?: { trackHistory?: boolean }): void {
    if (this.activeTab === tab) {
      return;
    }

    if (options?.trackHistory !== false) {
      this.tabBackStack.push(this.activeTab);
      this.tabForwardStack.length = 0;
    }

    this.activeTab = tab;
  }

  private canTabGoBack(): boolean {
    return this.tabBackStack.length > 0;
  }

  private canTabGoForward(): boolean {
    return this.tabForwardStack.length > 0;
  }

  private canGlobalGoBack(): boolean {
    if (this.activeTab === 'explore' && this.canExplorerGoBack()) {
      return true;
    }

    if (this.activeTab === 'document' && this.canDocumentGoBack()) {
      return true;
    }

    return this.canTabGoBack();
  }

  private canGlobalGoForward(): boolean {
    if (this.activeTab === 'explore' && this.canExplorerGoForward()) {
      return true;
    }

    if (this.activeTab === 'document' && this.canDocumentGoForward()) {
      return true;
    }

    return this.canTabGoForward();
  }

  private goGlobalBack(): void {
    if (this.activeTab === 'explore' && this.canExplorerGoBack()) {
      this.goExplorerBack();
      return;
    }

    if (this.activeTab === 'document' && this.canDocumentGoBack()) {
      this.goDocumentBack();
      return;
    }

    const previousTab = this.tabBackStack.pop();
    if (!previousTab) {
      return;
    }

    this.tabForwardStack.push(this.activeTab);
    this.activeTab = previousTab;
  }

  private goGlobalForward(): void {
    if (this.activeTab === 'explore' && this.canExplorerGoForward()) {
      this.goExplorerForward();
      return;
    }

    if (this.activeTab === 'document' && this.canDocumentGoForward()) {
      this.goDocumentForward();
      return;
    }

    const nextTab = this.tabForwardStack.pop();
    if (!nextTab) {
      return;
    }

    this.tabBackStack.push(this.activeTab);
    this.activeTab = nextTab;
  }

  public async recordGateWorkflowResult(
    key: 'stageCheck' | 'build',
    result: WorkflowRunResult
  ): Promise<void> {
    if (result.cancelled) {
      return;
    }

    const context = result.projectDir ? undefined : await this.getCurrentProjectContext();
    const projectDir = result.projectDir ?? context?.projectDir;
    if (result.ok) {
      this.updateGateSnapshot(projectDir, key, 'success', key === 'build' ? result.outputPath : undefined, result.stage);
    } else {
      this.updateGateSnapshot(projectDir, key, 'failed', result.error, result.stage);
    }

    await this.refresh();
  }

  private navigateExplorerToRoute(route: ExplorerRoute, options?: { trackHistory?: boolean }): void {
    const normalized = normalizeExplorerRoute(route);
    if (!normalized) {
      return;
    }

    const current = this.explorerRoute;
    if (isSameExplorerRoute(current, normalized)) {
      this.explorerBacklinksExpanded = false;
      this.explorerLoadToken += 1;
      return;
    }

    if (options?.trackHistory) {
      this.explorerBackStack.push(current);
      this.explorerForwardStack.length = 0;
    }

    this.explorerRoute = normalized;
    this.explorerBacklinksExpanded = false;
    this.explorerLoadToken += 1;
  }

  private canExplorerGoBack(): boolean {
    return this.explorerBackStack.length > 0;
  }

  private canExplorerGoForward(): boolean {
    return this.explorerForwardStack.length > 0;
  }

  private goExplorerBack(): void {
    if (this.explorerBackStack.length === 0) {
      return;
    }

    const previous = this.explorerBackStack.pop();
    if (!previous) {
      return;
    }

    this.explorerForwardStack.push(this.explorerRoute);
    this.navigateExplorerToRoute(previous, { trackHistory: false });
  }

  private goExplorerForward(): void {
    if (this.explorerForwardStack.length === 0) {
      return;
    }

    const next = this.explorerForwardStack.pop();
    if (!next) {
      return;
    }

    this.explorerBackStack.push(this.explorerRoute);
    this.navigateExplorerToRoute(next, { trackHistory: false });
  }

  private canExplorerGoHome(): boolean {
    return this.explorerRoute.kind !== 'home';
  }

  private canDocumentGoBack(): boolean {
    return this.documentBackStack.length > 0;
  }

  private canDocumentGoForward(): boolean {
    return this.documentForwardStack.length > 0;
  }

  private goDocumentBack(): void {
    const previous = this.documentBackStack.pop();
    if (!previous) {
      return;
    }

    const current = this.getCurrentDocumentViewSnapshot();
    if (current && current.documentPath) {
      this.pushDocumentSnapshot(this.documentForwardStack, current);
    }

    this.lastDocumentTabSnapshot = {
      ...previous,
      documentTabDetached: true
    };
  }

  private goDocumentForward(): void {
    const next = this.documentForwardStack.pop();
    if (!next) {
      return;
    }

    const current = this.getCurrentDocumentViewSnapshot();
    if (current && current.documentPath) {
      this.pushDocumentSnapshot(this.documentBackStack, current);
    }

    this.lastDocumentTabSnapshot = {
      ...next,
      documentTabDetached: true
    };
  }

  private getCurrentDocumentViewSnapshot(): SidebarState | undefined {
    const current = this.lastRenderedState;
    if (current && current.activeTab === 'document' && current.showDocumentTab && current.documentPath) {
      return current;
    }

    return this.lastDocumentTabSnapshot;
  }

  private maybeHandleActiveEditorNavigation(): boolean {
    const activeEditorDocument = vscode.window.activeTextEditor?.document;
    const nextActiveEditorPath = activeEditorDocument?.uri.fsPath ?? '';
    const normalizedActiveEditorPath = nextActiveEditorPath
      ? path.resolve(nextActiveEditorPath)
      : '';
    const currentSnapshot = this.getCurrentDocumentViewSnapshot();
    const currentSnapshotPath = currentSnapshot?.documentPath
      ? path.resolve(currentSnapshot.documentPath)
      : '';
    const shouldFollowSnapshotMismatch = !!normalizedActiveEditorPath
      && !!activeEditorDocument
      && activeEditorDocument.languageId === 'markdown'
      && currentSnapshotPath !== normalizedActiveEditorPath;
    if (nextActiveEditorPath === this.lastObservedActiveEditorPath && !shouldFollowSnapshotMismatch) {
      return false;
    }

    this.lastObservedActiveEditorPath = nextActiveEditorPath;

    if (!activeEditorDocument || activeEditorDocument.languageId !== 'markdown') {
      return false;
    }

    this.followActiveMarkdownDocument(activeEditorDocument.uri.fsPath);
    return true;
  }

  private followActiveMarkdownDocument(filePath: string): void {
    const normalizedTarget = path.resolve(filePath);
    const currentSnapshot = this.getCurrentDocumentViewSnapshot();
    const currentPath = currentSnapshot?.documentPath ? path.resolve(currentSnapshot.documentPath) : '';

    const willChangeViewedDocument = !currentPath || currentPath !== normalizedTarget;
    const willAttachCurrentDocument = !!currentSnapshot?.documentTabDetached && currentPath === normalizedTarget;

    if (willChangeViewedDocument && currentSnapshot && currentSnapshot.documentPath) {
      this.pushDocumentSnapshot(this.documentBackStack, currentSnapshot);
      this.documentForwardStack.length = 0;
    } else if (willAttachCurrentDocument) {
      this.documentForwardStack.length = 0;
    }

    this.setActiveTab('document');
  }

  private pushDocumentSnapshot(stack: SidebarState[], snapshot: SidebarState): void {
    if (!snapshot.documentPath) {
      return;
    }

    const normalizedPath = path.resolve(snapshot.documentPath);
    const last = stack[stack.length - 1];
    if (last?.documentPath && path.resolve(last.documentPath) === normalizedPath) {
      stack[stack.length - 1] = snapshot;
      return;
    }

    stack.push(snapshot);
  }

  private getProjectPinnedEntries(projectDir: string): PinnedExplorerEntryState[] {
    const entries = this.pinnedByProject.get(projectDir) ?? [];
    return entries.map((entry) => ({
      ...entry,
      collapsed: !!entry.collapsed
    }));
  }

  private setProjectPinnedEntries(projectDir: string, entries: PinnedExplorerEntryState[]): void {
    if (entries.length === 0) {
      this.pinnedByProject.delete(projectDir);
      return;
    }
    this.pinnedByProject.set(projectDir, entries.map((entry) => ({ ...entry })));
  }

  private resetActiveExplorerInstance(): void {
    const currentState: ActiveExplorerState = {
      route: this.explorerRoute,
      backStack: this.explorerBackStack,
      forwardStack: this.explorerForwardStack,
      backlinksExpanded: this.explorerBacklinksExpanded,
      backlinkFilter: this.backlinkFilter,
      loadToken: this.explorerLoadToken
    };
    const nextState = resetActiveExplorerForNewInstance(currentState);

    this.explorerRoute = nextState.route;
    this.explorerBackStack.length = 0;
    this.explorerForwardStack.length = 0;
    this.explorerBacklinksExpanded = nextState.backlinksExpanded;
    this.backlinkFilter = nextState.backlinkFilter;
    this.explorerLoadToken = nextState.loadToken;
  }

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    this.webviewReady = false;
    const workspaceRoots = vscode.workspace.workspaceFolders?.map((folder) => folder.uri) ?? [];
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri, ...workspaceRoots]
    };

    webviewView.webview.onDidReceiveMessage((message: unknown) => {
      const inbound = parseSidebarInboundMessage(message);
      if (!inbound) {
        return;
      }

      if (inbound.type === 'ready') {
        this.webviewReady = true;
        if (this.lastPostedState) {
          const payload: SidebarHostMessage<SidebarWebviewState> = {
            type: 'state',
            state: this.lastPostedState
          };
          void webviewView.webview.postMessage(payload);
          this.bus.publish({ type: 'state.posted', state: this.lastPostedState });
        }
        return;
      }

      void this.handleMessage(inbound);
    });

    webviewView.webview.html = renderSidebarShellHtml(webviewView.webview, this.extensionUri);

    void this.refresh('full');
  }

  public scheduleRefresh(options?: { mode?: RefreshMode; debounceMs?: number }): void {
    const mode = options?.mode ?? 'full';
    const debounceMs = options?.debounceMs ?? (mode === 'fast' ? 180 : 0);
    this.scheduledRefreshMode = this.mergeRefreshMode(this.scheduledRefreshMode, mode);

    if (this.scheduledRefreshTimer) {
      clearTimeout(this.scheduledRefreshTimer);
    }

    this.scheduledRefreshTimer = setTimeout(() => {
      this.scheduledRefreshTimer = undefined;
      const scheduledMode = this.scheduledRefreshMode ?? 'full';
      this.scheduledRefreshMode = undefined;
      this.requestImmediateRefresh(scheduledMode);
    }, debounceMs);
  }

  public async refresh(mode: RefreshMode = 'full'): Promise<void> {
    this.clearScheduledRefresh();
    this.requestImmediateRefresh(mode);
  }

  private clearScheduledRefresh(): void {
    if (this.scheduledRefreshTimer) {
      clearTimeout(this.scheduledRefreshTimer);
      this.scheduledRefreshTimer = undefined;
    }
    this.scheduledRefreshMode = undefined;
  }

  private mergeRefreshMode(a: RefreshMode | undefined, b: RefreshMode): RefreshMode {
    if (!a) {
      return b;
    }

    return a === 'full' || b === 'full' ? 'full' : 'fast';
  }

  private requestImmediateRefresh(mode: RefreshMode): void {
    const mergedMode = this.mergeRefreshMode(mode, this.scheduledRefreshMode ?? mode);
    this.scheduledRefreshMode = undefined;

    this.refreshNonce += 1;
    if (this.refreshInFlight) {
      this.queuedRefreshMode = this.mergeRefreshMode(this.queuedRefreshMode, mergedMode);
      return;
    }

    const nonce = this.refreshNonce;
    this.bus.publish({ type: 'refresh.requested', mode: mergedMode });
    void this.runRefresh(mergedMode, nonce);
  }

  private async runRefresh(mode: RefreshMode, nonce: number): Promise<void> {
    if (!this.view) {
      return;
    }

    this.refreshInFlight = true;
    try {
      const state = await this.getSidebarState(mode);
      if (!this.view || nonce !== this.refreshNonce) {
        return;
      }

      this.lastRenderedState = state;
      if (
        state.activeTab === 'document'
        && state.hasActiveMarkdown
        && !state.documentTabDetached
      ) {
        this.lastDocumentTabSnapshot = state;
      }
      const webviewState = projectSidebarState(this.view.webview, state);
      this.lastPostedState = webviewState;
      const payload: SidebarHostMessage<SidebarWebviewState> = {
        type: 'state',
        state: webviewState
      };
      for (const listener of this.stateSubscribers) {
        listener(webviewState);
      }
      void this.view.webview.postMessage(payload).then((delivered) => {
        if (delivered) {
          this.webviewReady = true;
          this.bus.publish({ type: 'state.posted', state: webviewState });
        }
      }, () => {
        // Ignore transient message delivery failures; the next refresh will retry.
      });
    } finally {
      this.refreshInFlight = false;
      if (this.queuedRefreshMode) {
        const nextMode = this.queuedRefreshMode;
        this.queuedRefreshMode = undefined;
        this.requestImmediateRefresh(nextMode);
      }
    }
  }

  private async getSidebarState(mode: RefreshMode): Promise<SidebarState> {
    if (mode === 'fast') {
      const fastState = await this.getSidebarStateFast();
      if (fastState) {
        return fastState;
      }
    }

    return this.getSidebarStateFull();
  }

  private async getSidebarStateFast(): Promise<SidebarState | undefined> {
    const previous = this.lastRenderedState;
    const document = getActiveMarkdownDocument(false);
    if (!previous || !document) {
      return undefined;
    }

    const sameDocument = path.resolve(previous.documentPath) === path.resolve(document.uri.fsPath);
    if (!sameDocument || previous.mode !== 'manuscript') {
      return undefined;
    }

    if (previous.activeTab !== 'document') {
      const effectiveTab = this.resolveEffectiveTab(this.activeTab, previous.canShowOverview, previous.showExplorer);
      this.activeTab = effectiveTab;
      return {
        ...previous,
        showDocumentTab: true,
        activeEditorPath: document.uri.fsPath,
        documentTabDetached: false,
        activeTab: effectiveTab,
        explorerCanGoBack: this.canExplorerGoBack(),
        explorerCanGoForward: this.canExplorerGoForward(),
        globalCanGoBack: this.canGlobalGoBack(),
        globalCanGoForward: this.canGlobalGoForward(),
        explorerCanGoHome: this.canExplorerGoHome(),
        explorerLoadToken: this.explorerLoadToken
      };
    }

    if (this.activeTab !== 'document') {
      return undefined;
    }

    const enableComments = getConfig('comments', document.uri).get<boolean>('enable', true) !== false;
    const emptyComments: SidebarCommentsState = {
      selectedId: undefined,
      currentAuthor: undefined,
      items: [],
      parseErrors: [],
      totalCount: 0,
      unresolvedCount: 0
    };

    const comments = enableComments
      ? buildSidebarCommentsState(document.uri.toString(), this.selectedCommentId)
      : emptyComments;
    comments.currentAuthor = normalizeAuthor(getConfig('comments', document.uri).get<string>('author', '') ?? '');
    this.selectedCommentId = comments.selectedId;

    const canShowOverview = previous.canShowOverview;
    const effectiveTab = this.resolveEffectiveTab(this.activeTab, canShowOverview, previous.showExplorer);
    this.activeTab = effectiveTab;

    try {
      const parsed = parseMarkdownDocument(document.getText());
      const statusControl = await buildStatusControl(parsed.frontmatter, document);
      const metadataEntries = this.buildFastMetadataEntries(parsed.frontmatter, previous.metadataEntries);
      const projectDir = previous.projectDir ?? path.dirname(document.uri.fsPath);
      const imageEntries = buildSidebarImageEntries({
        body: parsed.body,
        frontmatter: parsed.frontmatter,
        chapterPath: document.uri.fsPath,
        projectDir,
        projectDefaults: previous.projectImageDefaults
      });

      return {
        ...previous,
        hasActiveMarkdown: true,
        showDocumentTab: true,
        activeEditorPath: document.uri.fsPath,
        documentTabDetached: false,
        documentPath: document.uri.fsPath,
        projectDir,
        canShowOverview,
        activeTab: effectiveTab,
        mode: 'manuscript',
        parseError: undefined,
        metadataCollapsed: this.metadataCollapsed,
        metadataEditing: this.metadataEditing,
        enableComments,
        statusControl,
        metadataEntries,
        imageEntries,
        showMetadataPanel: true,
        explorerCollapsed: this.explorerCollapsed,
        explorerCanGoBack: this.canExplorerGoBack(),
        explorerCanGoForward: this.canExplorerGoForward(),
        globalCanGoBack: this.canGlobalGoBack(),
        globalCanGoForward: this.canGlobalGoForward(),
        explorerCanGoHome: this.canExplorerGoHome(),
        explorerLoadToken: this.explorerLoadToken,
        backlinkFilter: this.backlinkFilter,
        showToc: false,
        comments
      };
    } catch (error) {
      return {
        ...previous,
        hasActiveMarkdown: true,
        showDocumentTab: true,
        activeEditorPath: document.uri.fsPath,
        documentTabDetached: false,
        documentPath: document.uri.fsPath,
        projectDir: previous.projectDir,
        canShowOverview,
        activeTab: effectiveTab,
        mode: 'manuscript',
        parseError: errorToMessage(error),
        metadataCollapsed: this.metadataCollapsed,
        metadataEditing: this.metadataEditing,
        enableComments,
        statusControl: undefined,
        metadataEntries: [],
        imageEntries: [],
        projectImageDefaults: previous.projectImageDefaults,
        showMetadataPanel: true,
        explorerCollapsed: this.explorerCollapsed,
        explorerCanGoBack: this.canExplorerGoBack(),
        explorerCanGoForward: this.canExplorerGoForward(),
        globalCanGoBack: this.canGlobalGoBack(),
        globalCanGoForward: this.canGlobalGoForward(),
        explorerCanGoHome: this.canExplorerGoHome(),
        explorerLoadToken: this.explorerLoadToken,
        backlinkFilter: this.backlinkFilter,
        showToc: false,
        comments
      };
    }
  }

  private buildFastMetadataEntries(
    frontmatter: Record<string, unknown>,
    previousEntries: SidebarState['metadataEntries']
  ): SidebarState['metadataEntries'] {
    const previousOrderByKey = new Map<string, number>();
    const previousByKey = new Map<string, SidebarState['metadataEntries'][number]>();
    for (let index = 0; index < previousEntries.length; index += 1) {
      const entry = previousEntries[index];
      previousOrderByKey.set(entry.key, index);
      previousByKey.set(entry.key, entry);
    }

    const keys = Object.keys(frontmatter)
      .filter((key) => key !== 'status')
      .sort((a, b) => {
        const aOrder = previousOrderByKey.get(a);
        const bOrder = previousOrderByKey.get(b);
        if (aOrder !== undefined && bOrder !== undefined) {
          return aOrder - bOrder;
        }
        if (aOrder !== undefined) {
          return -1;
        }
        if (bOrder !== undefined) {
          return 1;
        }
        return a.localeCompare(b);
      });

    return keys.map((key) => {
      const value = frontmatter[key];
      const previous = previousByKey.get(key);
      if (Array.isArray(value)) {
        return {
          key,
          isStructural: previous?.isStructural ?? false,
          isBranch: previous?.isBranch ?? false,
          isArray: true,
          valueText: '',
          references: [],
          arrayItems: value.map((item, index) => ({
            index,
            valueText: formatMetadataValue(item),
            references: []
          }))
        };
      }

      return {
        key,
        isStructural: previous?.isStructural ?? false,
        isBranch: previous?.isBranch ?? false,
        isArray: false,
        valueText: formatMetadataValue(value),
        references: [],
        arrayItems: []
      };
    });
  }

  private buildMetadataEntriesFromFrontmatter(
    frontmatter: Record<string, unknown>,
    _branchById: Map<string, ProjectBranch>,
    _branchOrderById: Map<string, number>,
    index: Map<string, LeafTargetRecord>,
    document: vscode.TextDocument,
    pattern: string
  ): SidebarState['metadataEntries'] {
    return Object.entries(frontmatter)
      .filter(([key]) => key !== 'status')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => buildMetadataEntry(
        key,
        value,
        false,
        undefined,
        index,
        document,
        pattern
      ));
  }

  private buildSidebarTemplateEntries(projectContext: ProjectScanContext | undefined): SidebarState['templates'] {
    return (projectContext?.templates ?? []).map((template) => ({
      name: template.name,
      path: template.path,
      relativePath: template.relativePath,
      supportedTargets: [...template.supportedTargets]
    }));
  }

  private isReferenceLeafDocument(projectContext: ProjectScanContext | undefined, documentPath: string): boolean {
    if (!projectContext) {
      return false;
    }

    const resolved = path.resolve(documentPath);
    if (path.basename(resolved).toLowerCase() === '_branch.md' || path.extname(resolved).toLowerCase() !== '.md') {
      return false;
    }

    const contentRoot = path.resolve(projectContext.projectDir, CONTENT_DIR);
    const relativeToContent = path.relative(contentRoot, resolved);
    return relativeToContent.length > 0 && !relativeToContent.startsWith('..') && !path.isAbsolute(relativeToContent);
  }

  private async getSidebarStateFull(): Promise<SidebarState> {
    const autoFollowedActiveMarkdown = this.maybeHandleActiveEditorNavigation();

    const document = getActiveMarkdownDocument(false);
    if (!document) {
      const activeDocument = vscode.window.activeTextEditor?.document;
      const activeEditorPath = activeDocument?.uri.fsPath ?? '';
      const detachedDocumentState = this.buildDetachedDocumentTabState(activeEditorPath, {
        requireExplicitDetach: true
      });
      if (detachedDocumentState) {
        return detachedDocumentState;
      }
      const workspaceFolder = activeDocument ? vscode.workspace.getWorkspaceFolder(activeDocument.uri) : undefined;
      const projectContext = activeDocument && workspaceFolder
        ? await findNearestProjectConfig(activeDocument.uri.fsPath, workspaceFolder.uri.fsPath)
        : undefined;
      const canShowOverview = !!projectContext;
      const showExplorer = (projectContext?.branches.length ?? 0) > 0;
      let overview: SidebarOverviewState | undefined;
      let overviewSkippedFiles = 0;
      if (projectContext) {
        const built = await this.buildOverviewState(projectContext);
        overview = built.overview;
        overviewSkippedFiles = built.skippedFiles;
      }
      const warnings = this.collectSidebarWarnings(projectContext, overviewSkippedFiles);
      let activeTab = this.resolveEffectiveTab(this.activeTab, canShowOverview, showExplorer);
      if (activeTab === 'document') {
        activeTab = canShowOverview ? 'overview' : (showExplorer ? 'explore' : 'document');
      }
      this.activeTab = activeTab;

      let explorer = undefined;
      let pinnedExplorers: SidebarPinnedExplorerPanel[] = [];
      if (activeDocument && projectContext && showExplorer && activeTab === 'explore') {
        const index = await this.indexService.loadForDocument(activeDocument);
        const pattern = getConfig('links', activeDocument.uri).get<string>('identifierPattern', DEFAULT_IDENTIFIER_PATTERN);
        explorer = await buildExplorerState(
          activeDocument,
          index,
          projectContext,
          pattern,
          this.explorerRoute,
          this.backlinkFilter,
          this.explorerBacklinksExpanded,
          this.referenceUsageService
        );
        pinnedExplorers = await this.buildPinnedExplorerPanels(
          projectContext.projectDir,
          activeDocument,
          index,
          projectContext,
          pattern
        );
      }

      return {
        hasActiveMarkdown: false,
        showDocumentTab: !!this.lastDocumentTabSnapshot,
        activeEditorPath,
        documentTabDetached: false,
        documentPath: activeDocument?.uri.fsPath ?? '',
        projectDir: projectContext?.projectDir,
        warnings,
        canShowOverview,
        overview,
        activeTab,
        showExplorer,
        metadataCollapsed: false,
        metadataEditing: false,
        enableComments: true,
        statusControl: undefined,
        templates: this.buildSidebarTemplateEntries(projectContext),
        metadataEntries: [],
        imageEntries: [],
        projectImageDefaults: projectContext?.imageDefaults ?? {},
        showMetadataPanel: false,
        explorer,
        pinnedExplorers,
        canPinAllFromFile: false,
        explorerCollapsed: this.explorerCollapsed,
        explorerCanGoBack: this.canExplorerGoBack(),
        explorerCanGoForward: this.canExplorerGoForward(),
        globalCanGoBack: this.canGlobalGoBack(),
        globalCanGoForward: this.canGlobalGoForward(),
        explorerCanGoHome: this.canExplorerGoHome(),
        explorerLoadToken: this.explorerLoadToken,
        tocEntries: [],
        showToc: false,
        isBranchNotesFile: false,
        backlinkFilter: this.backlinkFilter,
        comments: {
          selectedId: undefined,
          items: [],
          parseErrors: [],
          totalCount: 0,
          unresolvedCount: 0
        }
      };
    }

    if (!autoFollowedActiveMarkdown) {
      const detachedDocumentState = this.buildDetachedDocumentTabState(document.uri.fsPath, {
        requireExplicitDetach: true
      });
      if (detachedDocumentState) {
        return detachedDocumentState;
      }
    }

    const enableComments = getConfig('comments', document.uri).get<boolean>('enable', true) !== false;

    const emptyComments: SidebarCommentsState = {
      selectedId: undefined,
      currentAuthor: undefined,
      items: [],
      parseErrors: [],
      totalCount: 0,
      unresolvedCount: 0
    };

    const comments = enableComments
      ? buildSidebarCommentsState(document.uri.toString(), this.selectedCommentId)
      : emptyComments;
    comments.currentAuthor = normalizeAuthor(getConfig('comments', document.uri).get<string>('author', '') ?? '');
    this.selectedCommentId = comments.selectedId;

    const manuscriptMode = isManuscriptPath(document.uri.fsPath);
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const projectContext = workspaceFolder
      ? await findNearestProjectConfig(document.uri.fsPath, workspaceFolder.uri.fsPath)
      : undefined;
    const canShowOverview = !!projectContext;
    const showExplorer = (projectContext?.branches.length ?? 0) > 0;
    const effectiveTab = this.resolveEffectiveTab(this.activeTab, canShowOverview, showExplorer);
    this.activeTab = effectiveTab;
    let overview: SidebarOverviewState | undefined;
    let overviewSkippedFiles = 0;
    if (projectContext && effectiveTab === 'overview') {
      const built = await this.buildOverviewState(projectContext);
      overview = built.overview;
      overviewSkippedFiles = built.skippedFiles;
    }
    const warnings = this.collectSidebarWarnings(projectContext, overviewSkippedFiles);

    const branchById = new Map<string, ProjectBranch>();
    const branchOrderById = new Map<string, number>();
    let branchOrder = 0;
    for (const branch of projectContext?.branches ?? []) {
      branchById.set(branch.id, branch);
      branchOrderById.set(branch.id, branchOrder);
      branchOrder += 1;
    }

    let branchForFile: ProjectBranch | undefined;
    if (!manuscriptMode && projectContext) {
      branchForFile = await resolveCurrentBranchFile(projectContext.projectDir, projectContext.branches, document.uri.fsPath);
    }
    const leafEntryMode = this.isReferenceLeafDocument(projectContext, document.uri.fsPath);
    const showTocPanel = !manuscriptMode && !leafEntryMode;

    const index = await this.indexService.loadForDocument(document);
    const pattern = getConfig('links', document.uri).get<string>('identifierPattern', DEFAULT_IDENTIFIER_PATTERN);
    const explorer = showExplorer && effectiveTab === 'explore'
      ? await buildExplorerState(
        document,
        index,
        projectContext,
        pattern,
        this.explorerRoute,
        this.backlinkFilter,
        this.explorerBacklinksExpanded,
        this.referenceUsageService
      )
      : undefined;
    const pinnedExplorers = showExplorer && effectiveTab === 'explore' && projectContext
      ? await this.buildPinnedExplorerPanels(projectContext.projectDir, document, index, projectContext, pattern)
      : [];
    const canPinAllFromFile = !!projectContext
      && showExplorer
      && this.collectReferencedLeafIdsInDocument(document, projectContext, pattern, index).length > 0;
    const tocWithBacklinks = showTocPanel
      ? await buildTocWithBacklinks(
        collectTocEntries(document),
        branchForFile,
        projectContext,
        document,
        index,
        pattern,
        this.backlinkFilter,
        this.expandedTocBacklinks,
        this.referenceUsageService
      )
      : [];

    if (!manuscriptMode) {
      let metadataEntries: SidebarState['metadataEntries'] = [];
      let parseError: string | undefined;
      if (leafEntryMode) {
        try {
          const parsed = parseMarkdownDocument(document.getText());
          metadataEntries = this.buildMetadataEntriesFromFrontmatter(
            parsed.frontmatter,
            branchById,
            branchOrderById,
            index,
            document,
            pattern
          );
        } catch (error) {
          parseError = errorToMessage(error);
        }
      }

      return {
        hasActiveMarkdown: true,
        showDocumentTab: true,
        activeEditorPath: document.uri.fsPath,
        documentTabDetached: false,
        documentPath: document.uri.fsPath,
        projectDir: projectContext?.projectDir,
        warnings,
        canShowOverview,
        overview,
        activeTab: effectiveTab,
        mode: 'nonManuscript',
        parseError,
        showExplorer,
        metadataCollapsed: leafEntryMode ? this.metadataCollapsed : false,
        metadataEditing: leafEntryMode ? this.metadataEditing : false,
        enableComments,
        statusControl: undefined,
        templates: this.buildSidebarTemplateEntries(projectContext),
        metadataEntries,
        imageEntries: [],
        projectImageDefaults: projectContext?.imageDefaults ?? {},
        showMetadataPanel: leafEntryMode,
        explorer,
        pinnedExplorers,
        canPinAllFromFile,
        explorerCollapsed: this.explorerCollapsed,
        explorerCanGoBack: this.canExplorerGoBack(),
        explorerCanGoForward: this.canExplorerGoForward(),
        globalCanGoBack: this.canGlobalGoBack(),
        globalCanGoForward: this.canGlobalGoForward(),
        explorerCanGoHome: this.canExplorerGoHome(),
        explorerLoadToken: this.explorerLoadToken,
        tocEntries: tocWithBacklinks,
        showToc: showTocPanel,
        isBranchNotesFile: !!branchForFile,
        backlinkFilter: this.backlinkFilter,
        comments
      };
    }

    try {
      const parsed = parseMarkdownDocument(document.getText());
      const projectDir = projectContext?.projectDir ?? path.dirname(document.uri.fsPath);
      const projectImageDefaults = projectContext?.imageDefaults ?? {};
      const statusControl = await buildStatusControl(parsed.frontmatter, document);
      const metadataEntries = this.buildMetadataEntriesFromFrontmatter(
        parsed.frontmatter,
        branchById,
        branchOrderById,
        index,
        document,
        pattern
      );
      const imageEntries = buildSidebarImageEntries({
        body: parsed.body,
        frontmatter: parsed.frontmatter,
        chapterPath: document.uri.fsPath,
        projectDir,
        projectDefaults: projectImageDefaults
      });

      return {
        hasActiveMarkdown: true,
        showDocumentTab: true,
        activeEditorPath: document.uri.fsPath,
        documentTabDetached: false,
        documentPath: document.uri.fsPath,
        projectDir,
        warnings,
        canShowOverview,
        overview,
        activeTab: effectiveTab,
        mode: 'manuscript',
        showExplorer,
        metadataCollapsed: this.metadataCollapsed,
        metadataEditing: this.metadataEditing,
        enableComments,
        statusControl,
        templates: this.buildSidebarTemplateEntries(projectContext),
        metadataEntries,
        imageEntries,
        projectImageDefaults,
        showMetadataPanel: true,
        explorer,
        pinnedExplorers,
        canPinAllFromFile,
        explorerCollapsed: this.explorerCollapsed,
        explorerCanGoBack: this.canExplorerGoBack(),
        explorerCanGoForward: this.canExplorerGoForward(),
        globalCanGoBack: this.canGlobalGoBack(),
        globalCanGoForward: this.canGlobalGoForward(),
        explorerCanGoHome: this.canExplorerGoHome(),
        explorerLoadToken: this.explorerLoadToken,
        tocEntries: [],
        showToc: false,
        isBranchNotesFile: false,
        backlinkFilter: this.backlinkFilter,
        comments
      };
    } catch (error) {
      return {
        hasActiveMarkdown: true,
        showDocumentTab: true,
        activeEditorPath: document.uri.fsPath,
        documentTabDetached: false,
        documentPath: document.uri.fsPath,
        projectDir: projectContext?.projectDir,
        warnings,
        canShowOverview,
        overview,
        activeTab: effectiveTab,
        mode: 'manuscript',
        parseError: errorToMessage(error),
        showExplorer,
        metadataCollapsed: this.metadataCollapsed,
        metadataEditing: this.metadataEditing,
        enableComments,
        statusControl: undefined,
        templates: this.buildSidebarTemplateEntries(projectContext),
        metadataEntries: [],
        imageEntries: [],
        projectImageDefaults: projectContext?.imageDefaults ?? {},
        showMetadataPanel: true,
        explorer,
        pinnedExplorers,
        canPinAllFromFile,
        explorerCollapsed: this.explorerCollapsed,
        explorerCanGoBack: this.canExplorerGoBack(),
        explorerCanGoForward: this.canExplorerGoForward(),
        globalCanGoBack: this.canGlobalGoBack(),
        globalCanGoForward: this.canGlobalGoForward(),
        explorerCanGoHome: this.canExplorerGoHome(),
        explorerLoadToken: this.explorerLoadToken,
        tocEntries: [],
        showToc: false,
        isBranchNotesFile: false,
        backlinkFilter: this.backlinkFilter,
        comments
      };
    }
  }

  private compareManuscriptFiles(aPath: string, bPath: string): number {
    const aName = path.basename(aPath, path.extname(aPath));
    const bName = path.basename(bPath, path.extname(bPath));
    const aMatch = aName.match(/^(\d+)[-_]/);
    const bMatch = bName.match(/^(\d+)[-_]/);

    if (aMatch && bMatch) {
      const aOrder = Number(aMatch[1]);
      const bOrder = Number(bMatch[1]);
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
    } else if (aMatch) {
      return -1;
    } else if (bMatch) {
      return 1;
    }

    return aPath.localeCompare(bPath);
  }

  private collectReferencedLeafIdsInDocument(
    document: vscode.TextDocument,
    projectContext: ProjectScanContext,
    pattern: string,
    index: Map<string, LeafTargetRecord>
  ): string[] {
    if (index.size === 0) {
      return [];
    }

    const byId = new Map<string, string>();
    const byAlias = new Map<string, string>();
    for (const [id, record] of index.entries()) {
      const normalizedId = id.trim().toUpperCase();
      if (!normalizedId) {
        continue;
      }
      if (!byId.has(normalizedId)) {
        byId.set(normalizedId, id);
      }

      for (const alias of this.collectLeafTargetRecordAliases(record)) {
        const normalizedAlias = alias.trim().toLowerCase();
        if (!normalizedAlias || byAlias.has(normalizedAlias)) {
          continue;
        }
        byAlias.set(normalizedAlias, id);
      }
    }

    if (byId.size === 0 && byAlias.size === 0) {
      return [];
    }

    const result: string[] = [];
    const seen = new Set<string>();
    const pushIfKnown = (rawValue: string): void => {
      const candidate = rawValue.trim();
      if (!candidate) {
        return;
      }

      const byExactId = byId.get(candidate.toUpperCase());
      if (byExactId && !seen.has(byExactId)) {
        seen.add(byExactId);
        result.push(byExactId);
        return;
      }

      const byEntryAlias = byAlias.get(candidate.toLowerCase());
      if (byEntryAlias && !seen.has(byEntryAlias)) {
        seen.add(byEntryAlias);
        result.push(byEntryAlias);
      }
    };

    const lines = document.getText().split(/\r?\n/);
    const occurrences = collectIdentifierOccurrencesFromLines(lines, pattern, true);

    for (const occurrence of occurrences) {
      pushIfKnown(occurrence.id);
    }

    let parsed: ReturnType<typeof parseMarkdownDocument> | undefined;
    try {
      parsed = parseMarkdownDocument(document.getText());
    } catch {
      parsed = undefined;
    }

    if (!parsed) {
      return result;
    }

    for (const branch of projectContext.branches) {
      const value = parsed.frontmatter[branch.id];
      if (typeof value === 'string') {
        pushIfKnown(value);
        for (const token of extractIdentifierTokensFromValue(value, pattern)) {
          pushIfKnown(token);
        }
        continue;
      }

      if (!Array.isArray(value)) {
        continue;
      }

      for (const item of value) {
        if (typeof item !== 'string') {
          continue;
        }
        pushIfKnown(item);
        for (const token of extractIdentifierTokensFromValue(item, pattern)) {
          pushIfKnown(token);
        }
      }
    }

    return result;
  }

  private collectLeafTargetRecordAliases(record: LeafTargetRecord): string[] {
    const aliases: string[] = [];
    const recordPath = record.path?.trim().replace(/\\/g, '/');
    if (!recordPath) {
      return aliases;
    }

    aliases.push(recordPath);
    const contentPath = recordPath.toLowerCase().startsWith('content/')
      ? recordPath
      : (() => {
        const markerIndex = recordPath.toLowerCase().lastIndexOf('/content/');
        if (markerIndex >= 0) {
          return recordPath.slice(markerIndex + 1);
        }
        return undefined;
      })();
    if (!contentPath) {
      return aliases;
    }

    aliases.push(contentPath);
    const match = contentPath.match(/^content\/reference\/([^/]+)\/(.+)\.(md|markdown|txt|text)$/i);
    if (!match) {
      return aliases;
    }

    const categoryKey = match[1].trim();
    const entryKey = match[2].trim();
    if (!entryKey || entryKey.toLowerCase() === '_category') {
      return aliases;
    }

    aliases.push(entryKey);
    aliases.push(path.posix.basename(entryKey));
    aliases.push(`${categoryKey}/${entryKey}`);
    return aliases;
  }

  private async buildPinnedExplorerPanels(
    projectDir: string,
    document: vscode.TextDocument,
    index: Map<string, LeafTargetRecord>,
    projectContext: ProjectScanContext,
    pattern: string
  ): Promise<SidebarPinnedExplorerPanel[]> {
    const pinnedEntries = this.getProjectPinnedEntries(projectDir).slice(0, SidebarRuntime.PIN_LIMIT);
    if (pinnedEntries.length === 0) {
      return [];
    }

    const panels = await Promise.all(pinnedEntries.map(async (pinnedEntry) => {
      const page = await buildExplorerState(
        document,
        index,
        projectContext,
        pattern,
        { kind: 'identifier', id: pinnedEntry.id },
        pinnedEntry.backlinkFilter,
        pinnedEntry.backlinksExpanded,
        this.referenceUsageService
      );
      if (!page || page.kind !== 'identifier') {
        return undefined;
      }

      return {
        id: pinnedEntry.id,
        page,
        backlinkFilter: pinnedEntry.backlinkFilter,
        backlinksExpanded: pinnedEntry.backlinksExpanded,
        collapsed: !!pinnedEntry.collapsed
      };
    }));

    return panels.filter((panel): panel is SidebarPinnedExplorerPanel => !!panel);
  }

  private async handleMessage(payload: SidebarActionMessage): Promise<void> {
    this.bus.publish({ type: 'action.received', action: payload });
    for (const handler of SIDEBAR_ACTION_HANDLERS) {
      const handled = await handler(this, payload);
      if (handled) {
        return;
      }
    }

    this.bus.publish({
      type: 'action.error',
      actionType: payload.type,
      message: `Unhandled sidebar action: ${payload.type}`
    });
    await this.effectRunner.run({
      type: 'notification.warning',
      message: `Unhandled sidebar action: ${payload.type}`
    });
  }

  public async handleUiAction(payload: SidebarActionMessage): Promise<boolean> {
    if (!payload.type.startsWith('ui.')) {
      return false;
    }
    await this.handleActionByType(payload);
    return true;
  }

  public async handleNavigationAction(payload: SidebarActionMessage): Promise<boolean> {
    if (!payload.type.startsWith('nav.') && !payload.type.startsWith('doc.')) {
      return false;
    }
    await this.handleActionByType(payload);
    return true;
  }

  public async handleMetadataAction(payload: SidebarActionMessage): Promise<boolean> {
    if (!payload.type.startsWith('metadata.')) {
      return false;
    }
    await this.handleActionByType(payload);
    return true;
  }

  public async handleImageAction(payload: SidebarActionMessage): Promise<boolean> {
    if (!payload.type.startsWith('images.')) {
      return false;
    }
    await this.handleActionByType(payload);
    return true;
  }

  public async handleExploreAction(payload: SidebarActionMessage): Promise<boolean> {
    if (!payload.type.startsWith('explore.')) {
      return false;
    }
    await this.handleActionByType(payload);
    return true;
  }

  public async handleCommentAction(payload: SidebarActionMessage): Promise<boolean> {
    if (!payload.type.startsWith('comments.')) {
      return false;
    }
    await this.handleActionByType(payload);
    return true;
  }

  public async handleWorkflowAction(payload: SidebarActionMessage): Promise<boolean> {
    if (!payload.type.startsWith('workflow.')) {
      return false;
    }
    await this.handleActionByType(payload);
    return true;
  }

  public async handleOverviewAction(payload: SidebarActionMessage): Promise<boolean> {
    if (!payload.type.startsWith('overview.')) {
      return false;
    }
    await this.handleActionByType(payload);
    return true;
  }

  private async handleActionByType(payload: SidebarActionMessage): Promise<void> {
    let shouldRefreshDiagnostics = true;

    switch (payload.type) {
      case 'ui.setTab': {
        shouldRefreshDiagnostics = false;
        const value = typeof payload.value === 'string' ? payload.value.trim().toLowerCase() : '';
        if (value === 'document' || value === 'explore' || value === 'overview') {
          if (value === 'overview' || value === 'explore') {
            const activeEditorDoc = vscode.window.activeTextEditor?.document;
            const folder = activeEditorDoc ? vscode.workspace.getWorkspaceFolder(activeEditorDoc.uri) : undefined;
            const context = activeEditorDoc && folder
              ? await findNearestProjectConfig(activeEditorDoc.uri.fsPath, folder.uri.fsPath)
              : undefined;
            if (value === 'overview' && !context) {
              break;
            }
            if (value === 'explore' && (!context || context.branches.length === 0)) {
              break;
            }
          }

          this.setActiveTab(value);
        }
        break;
      }
      case 'metadata.toggleCollapse': {
        shouldRefreshDiagnostics = false;
        this.metadataCollapsed = !this.metadataCollapsed;
        break;
      }
      case 'nav.globalBack': {
        shouldRefreshDiagnostics = false;
        this.goGlobalBack();
        break;
      }
      case 'nav.globalForward': {
        shouldRefreshDiagnostics = false;
        this.goGlobalForward();
        break;
      }
      case 'workflow.compile': {
        shouldRefreshDiagnostics = false;
        const result = await runProjectBuildWorkflow();
        if (result.cancelled) {
          break;
        }
        if (result.ok) {
          this.updateGateSnapshot(result.projectDir, 'build', 'success', result.outputPath);
        } else {
          this.updateGateSnapshot(result.projectDir, 'build', 'failed', result.error);
        }
        break;
      }
      case 'workflow.stageCheck': {
        shouldRefreshDiagnostics = false;
        const result = await runProjectGateStageWorkflow();
        if (result.cancelled) {
          break;
        }
        if (result.ok) {
          this.updateGateSnapshot(result.projectDir, 'stageCheck', 'success', undefined, result.stage);
        } else {
          this.updateGateSnapshot(result.projectDir, 'stageCheck', 'failed', result.error, result.stage);
        }
        break;
      }
      case 'workflow.newManuscript': {
        shouldRefreshDiagnostics = false;
        const result = await runNewManuscriptWorkflow();
        if (result.ok) {
          this.expandMetadataPanel();
        }
        break;
      }
      case 'overview.openFirstUnresolvedComment': {
        shouldRefreshDiagnostics = false;
        if (typeof payload.filePath !== 'string' || typeof payload.commentId !== 'string') {
          break;
        }

        try {
          const target = vscode.Uri.file(payload.filePath);
          const document = await vscode.workspace.openTextDocument(target);
          const result = await jumpToComment(document, payload.commentId);
          if (result.warning) {
            void vscode.window.showWarningMessage(result.warning);
            break;
          }
          this.setActiveTab('document');
          this.selectedCommentId = payload.commentId.trim().toUpperCase();
        } catch (error) {
          void vscode.window.showWarningMessage(`Could not open unresolved comment: ${errorToMessage(error)}`);
        }
        break;
      }
      case 'overview.openFile': {
        shouldRefreshDiagnostics = false;
        if (typeof payload.filePath !== 'string') {
          break;
        }

        await openBacklinkFile(payload.filePath, 1);
        this.setActiveTab('document');
        break;
      }
      case 'overview.openFirstMissingMetadata': {
        shouldRefreshDiagnostics = false;
        if (typeof payload.filePath !== 'string') {
          break;
        }

        suppressAutoFoldFrontmatterForDocument(vscode.Uri.file(payload.filePath));
        await openBacklinkFile(payload.filePath, 1);
        this.expandMetadataPanel();
        this.setActiveTab('document');
        break;
      }
      case 'metadata.addField': {
        await promptAndAddMetadataField();
        break;
      }
      case 'metadata.editField': {
        if (typeof payload.key === 'string' && payload.key.trim().length > 0) {
          await promptAndEditMetadataField(payload.key.trim());
        }
        break;
      }
      case 'metadata.removeField': {
        if (typeof payload.key === 'string' && payload.key.trim().length > 0) {
          await removeMetadataField(payload.key.trim());
        }
        break;
      }
      case 'metadata.setStatus': {
        if (typeof payload.value === 'string' && payload.value.trim().length > 0) {
          await setMetadataStatus(payload.value.trim());
        }
        break;
      }
      case 'metadata.addArrayItem': {
        if (typeof payload.key === 'string' && payload.key.trim().length > 0) {
          await promptAndAddMetadataArrayItem(payload.key.trim());
        }
        break;
      }
      case 'metadata.editArrayItem': {
        const index = asNumber(payload.index);
        if (
          typeof payload.key === 'string'
          && payload.key.trim().length > 0
          && index !== undefined
          && Number.isInteger(index)
          && index >= 0
        ) {
          await promptAndEditMetadataArrayItem(payload.key.trim(), index);
        }
        break;
      }
      case 'metadata.removeArrayItem': {
        const index = asNumber(payload.index);
        if (
          typeof payload.key === 'string'
          && payload.key.trim().length > 0
          && index !== undefined
          && Number.isInteger(index)
          && index >= 0
        ) {
          await removeMetadataArrayItem(payload.key.trim(), index);
        }
        break;
      }
      case 'images.editFormat': {
        shouldRefreshDiagnostics = false;
        if (typeof payload.key === 'string' && payload.key.trim().length > 0) {
          await promptAndEditImageOverride(payload.key.trim());
        }
        break;
      }
      case 'images.resetToDefaults': {
        shouldRefreshDiagnostics = false;
        if (typeof payload.key === 'string' && payload.key.trim().length > 0) {
          await clearImageOverride(payload.key.trim());
        }
        break;
      }
      case 'metadata.toggleEditing': {
        shouldRefreshDiagnostics = false;
        this.metadataEditing = !this.metadataEditing;
        break;
      }
      case 'workflow.validateCurrentFile': {
        shouldRefreshDiagnostics = false;
        const result = await runLocalValidateWorkflow();
        break;
      }
      case 'images.insertFromFilePicker': {
        shouldRefreshDiagnostics = false;
        await runInsertImageWorkflow();
        break;
      }
      case 'metadata.fillRequired': {
        shouldRefreshDiagnostics = false;
        const projectContext = await this.getCurrentProjectConfigContext();
        if (!projectContext) {
          void vscode.window.showWarningMessage('Open a project leaf file first to fill required metadata.');
          break;
        }
        await promptAndFillRequiredMetadata(projectContext.requiredMetadata);
        break;
      }
      case 'doc.openPreview': {
        shouldRefreshDiagnostics = false;
        await openMarkdownPreviewCommand();
        break;
      }
      case 'doc.toggleFrontmatterFold': {
        shouldRefreshDiagnostics = false;
        await toggleFrontmatterFold();
        break;
      }
      case 'ui.refresh': {
        shouldRefreshDiagnostics = false;
        break;
      }
      case 'explore.openIdentifier': {
        shouldRefreshDiagnostics = false;
        if (typeof payload.id === 'string' && payload.id.trim().length > 0) {
          this.setActiveTab('explore');
          this.navigateExplorerToRoute({ kind: 'identifier', id: payload.id.trim() }, { trackHistory: true });
        }
        break;
      }
      case 'explore.openBranch': {
        shouldRefreshDiagnostics = false;
        if (
          typeof payload.id === 'string'
          && payload.id.trim().length > 0
        ) {
          this.navigateExplorerToRoute(
            { kind: 'branch', id: payload.id.trim() },
            { trackHistory: true }
          );
        }
        break;
      }
      case 'explore.goHome': {
        shouldRefreshDiagnostics = false;
        this.navigateExplorerToRoute({ kind: 'home' }, { trackHistory: true });
        break;
      }
      case 'explore.goBack': {
        shouldRefreshDiagnostics = false;
        this.goExplorerBack();
        break;
      }
      case 'explore.goForward': {
        shouldRefreshDiagnostics = false;
        this.goExplorerForward();
        break;
      }
      case 'explore.createBranch': {
        shouldRefreshDiagnostics = false;
        await this.promptAndAddBranch();
        break;
      }
      case 'explore.pinActiveEntry': {
        shouldRefreshDiagnostics = false;
        if (this.explorerRoute.kind !== 'identifier') {
          break;
        }

        const projectContext = await this.getCurrentProjectConfigContext();
        if (!projectContext || projectContext.branches.length === 0) {
          break;
        }

        const currentPins = this.getProjectPinnedEntries(projectContext.projectDir);
        const pinResult = pinExplorerEntry(currentPins, this.explorerRoute, SidebarRuntime.PIN_LIMIT);
        if (pinResult.kind === 'limit') {
          void vscode.window.showWarningMessage(`Pin limit reached (${SidebarRuntime.PIN_LIMIT}). Unpin an entry before pinning another.`);
          break;
        }
        if (pinResult.kind !== 'pinned') {
          break;
        }

        this.setProjectPinnedEntries(projectContext.projectDir, pinResult.entries);
        this.resetActiveExplorerInstance();
        break;
      }
      case 'explore.pinAllFromDocument': {
        shouldRefreshDiagnostics = false;
        const document = getActiveMarkdownDocument(false);
        if (!document) {
          break;
        }

        const projectContext = await this.getCurrentProjectConfigContext();
        if (!projectContext || projectContext.branches.length === 0) {
          break;
        }

        const pattern = getConfig('links', document.uri).get<string>('identifierPattern', DEFAULT_IDENTIFIER_PATTERN);
        const index = await this.indexService.loadForDocument(document);
        const candidateIds = this.collectReferencedLeafIdsInDocument(document, projectContext, pattern, index);

        if (candidateIds.length === 0) {
          void vscode.window.showInformationMessage('No leaf references found in the current file.');
          break;
        }

        let nextPins = this.getProjectPinnedEntries(projectContext.projectDir);
        let addedCount = 0;
        let hitLimit = false;
        for (const id of candidateIds) {
          const pinResult = pinExplorerEntry(nextPins, { kind: 'identifier', id }, SidebarRuntime.PIN_LIMIT);
          if (pinResult.kind === 'pinned') {
            nextPins = pinResult.entries;
            addedCount += 1;
            continue;
          }
          if (pinResult.kind === 'limit') {
            hitLimit = true;
            break;
          }
        }

        if (addedCount === 0) {
          if (hitLimit) {
            void vscode.window.showWarningMessage(`Pin limit reached (${SidebarRuntime.PIN_LIMIT}). Unpin an entry before pinning another.`);
          } else {
            void vscode.window.showInformationMessage('No new leaf references to pin from the current file.');
          }
          break;
        }

        this.setProjectPinnedEntries(projectContext.projectDir, nextPins);
        this.resetActiveExplorerInstance();
        if (hitLimit) {
          void vscode.window.showWarningMessage(
            `Pinned ${addedCount} leaf reference${addedCount === 1 ? '' : 's'} from the current file. Pin limit reached (${SidebarRuntime.PIN_LIMIT}).`
          );
        } else {
          void vscode.window.showInformationMessage(
            `Pinned ${addedCount} leaf reference${addedCount === 1 ? '' : 's'} from the current file.`
          );
        }
        break;
      }
      case 'explore.unpinEntry': {
        shouldRefreshDiagnostics = false;
        if (typeof payload.id !== 'string') {
          break;
        }

        const projectContext = await this.getCurrentProjectConfigContext();
        if (!projectContext || projectContext.branches.length === 0) {
          break;
        }

        const currentPins = this.getProjectPinnedEntries(projectContext.projectDir);
        const unpinResult = unpinExplorerEntry(currentPins, payload.id);
        if (!unpinResult.removed) {
          break;
        }

        this.setProjectPinnedEntries(projectContext.projectDir, unpinResult.entries);
        break;
      }
      case 'explore.unpinAll': {
        shouldRefreshDiagnostics = false;
        const projectContext = await this.getCurrentProjectConfigContext();
        if (!projectContext || projectContext.branches.length === 0) {
          break;
        }

        const currentPins = this.getProjectPinnedEntries(projectContext.projectDir);
        if (currentPins.length === 0) {
          break;
        }

        this.setProjectPinnedEntries(projectContext.projectDir, []);
        break;
      }
      case 'explore.toggleBacklinks': {
        shouldRefreshDiagnostics = false;
        this.explorerBacklinksExpanded = !this.explorerBacklinksExpanded;
        break;
      }
      case 'explore.togglePinnedBacklinks': {
        shouldRefreshDiagnostics = false;
        if (typeof payload.id !== 'string') {
          break;
        }

        const projectContext = await this.getCurrentProjectConfigContext();
        if (!projectContext || projectContext.branches.length === 0) {
          break;
        }

        const currentPins = this.getProjectPinnedEntries(projectContext.projectDir);
        const toggleResult = togglePinnedExplorerBacklinks(currentPins, payload.id);
        if (!toggleResult.toggled) {
          break;
        }

        this.setProjectPinnedEntries(projectContext.projectDir, toggleResult.entries);
        break;
      }
      case 'explore.togglePinnedCollapse': {
        shouldRefreshDiagnostics = false;
        if (typeof payload.id !== 'string') {
          break;
        }

        const projectContext = await this.getCurrentProjectConfigContext();
        if (!projectContext || projectContext.branches.length === 0) {
          break;
        }

        const currentPins = this.getProjectPinnedEntries(projectContext.projectDir);
        const toggleResult = togglePinnedExplorerCollapse(currentPins, payload.id);
        if (!toggleResult.toggled) {
          break;
        }

        this.setProjectPinnedEntries(projectContext.projectDir, toggleResult.entries);
        break;
      }
      case 'explore.toggleExplorerCollapse': {
        shouldRefreshDiagnostics = false;
        this.explorerCollapsed = !this.explorerCollapsed;
        break;
      }
      case 'explore.rebuildIndex': {
        shouldRefreshDiagnostics = false;
        this.indexService.clear();
        this.referenceUsageService.clear();
        await refreshVisibleMarkdownDocuments(this.indexService, this.diagnostics);
        void vscode.window.showInformationMessage('Stego leaf index rebuilt.');
        break;
      }
      case 'doc.openHeadingLine': {
        shouldRefreshDiagnostics = false;
        const line = asNumber(payload.line);
        if (line !== undefined) {
          await openLineInActiveDocument(line);
        }
        break;
      }
      case 'doc.toggleTocBacklinks': {
        shouldRefreshDiagnostics = false;
        if (typeof payload.id === 'string' && payload.id.trim().length > 0) {
          const id = payload.id.trim().toUpperCase();
          if (this.expandedTocBacklinks.has(id)) {
            this.expandedTocBacklinks.delete(id);
          } else {
            this.expandedTocBacklinks.add(id);
          }
        }
        break;
      }
      case 'explore.setBacklinkFilter': {
        shouldRefreshDiagnostics = false;
        const next = typeof payload.value === 'string' ? payload.value : '';
        this.backlinkFilter = next;
        break;
      }
      case 'explore.setPinnedBacklinkFilter': {
        shouldRefreshDiagnostics = false;
        if (typeof payload.id !== 'string') {
          break;
        }

        const projectContext = await this.getCurrentProjectConfigContext();
        if (!projectContext || projectContext.branches.length === 0) {
          break;
        }

        const nextValue = typeof payload.value === 'string' ? payload.value : '';
        const currentPins = this.getProjectPinnedEntries(projectContext.projectDir);
        const setResult = setPinnedExplorerBacklinkFilter(currentPins, payload.id, nextValue);
        if (!setResult.updated) {
          break;
        }

        this.setProjectPinnedEntries(projectContext.projectDir, setResult.entries);
        break;
      }
      case 'doc.openBacklink': {
        shouldRefreshDiagnostics = false;
        if (typeof payload.filePath === 'string') {
          const line = asNumber(payload.line) ?? 1;
          await openBacklinkFile(payload.filePath, line);
        }
        break;
      }
      case 'doc.openExternalLink': {
        shouldRefreshDiagnostics = false;
        if (typeof payload.url === 'string' && payload.url.trim().length > 0) {
          const basePath = typeof payload.basePath === 'string' && payload.basePath.trim().length > 0
            ? payload.basePath.trim()
            : undefined;
          await openExternalLink(payload.url.trim(), basePath);
        }
        break;
      }
      case 'comments.add': {
        shouldRefreshDiagnostics = false;
        const document = getActiveMarkdownDocument(true);
        if (!document || !getConfig('comments', document.uri).get<boolean>('enable', true)) {
          break;
        }
        const message = await vscode.window.showInputBox({
          prompt: 'New comment',
          placeHolder: 'Write your comment'
        });
        if (message === undefined) {
          break;
        }
        const author = getConfig('comments', document.uri).get<string>('author', '') ?? '';
        const result = await addCommentAtSelection(document, message, author);
        if (result.warning) {
          void vscode.window.showWarningMessage(result.warning);
          break;
        }
        this.setActiveTab('document');
        this.selectedCommentId = result.id;
        break;
      }
      case 'comments.selectThread': {
        shouldRefreshDiagnostics = false;
        if (typeof payload.id === 'string' && payload.id.trim().length > 0) {
          this.setActiveTab('document');
          this.selectedCommentId = payload.id.trim().toUpperCase();
        }
        break;
      }
      case 'comments.reply': {
        shouldRefreshDiagnostics = false;
        if (typeof payload.id !== 'string' || payload.id.trim().length === 0) {
          break;
        }
        const document = getActiveMarkdownDocument(true);
        if (!document) {
          break;
        }
        const message = await vscode.window.showInputBox({
          prompt: `Reply to ${payload.id.trim().toUpperCase()}`,
          placeHolder: 'Write your reply'
        });
        if (message === undefined) {
          break;
        }
        const author = getConfig('comments', document.uri).get<string>('author', '') ?? '';
        const result = await replyToComment(document, payload.id.trim(), message, author);
        if (result.warning) {
          void vscode.window.showWarningMessage(result.warning);
          break;
        }
        this.setActiveTab('document');
        this.selectedCommentId = result.id ?? payload.id.trim().toUpperCase();
        break;
      }
      case 'comments.toggleResolved': {
        shouldRefreshDiagnostics = false;
        if (typeof payload.id !== 'string' || payload.id.trim().length === 0) {
          break;
        }
        const document = getActiveMarkdownDocument(true);
        if (!document) {
          break;
        }
        const result = await toggleCommentResolved(document, payload.id.trim(), !!payload.resolveThread);
        if (result.warning) {
          void vscode.window.showWarningMessage(result.warning);
          break;
        }
        this.setActiveTab('document');
        this.selectedCommentId = payload.id.trim().toUpperCase();
        break;
      }
      case 'comments.jumpTo': {
        shouldRefreshDiagnostics = false;
        if (typeof payload.id !== 'string' || payload.id.trim().length === 0) {
          break;
        }
        const document = getActiveMarkdownDocument(true);
        if (!document) {
          break;
        }
        const result = await jumpToComment(document, payload.id.trim());
        if (result.warning) {
          void vscode.window.showWarningMessage(result.warning);
        }
        break;
      }
      case 'comments.delete': {
        shouldRefreshDiagnostics = false;
        if (typeof payload.id !== 'string' || payload.id.trim().length === 0) {
          break;
        }
        const document = getActiveMarkdownDocument(true);
        if (!document) {
          break;
        }
        const result = await deleteComment(document, payload.id.trim());
        if (result.warning) {
          void vscode.window.showWarningMessage(result.warning);
          break;
        }
        this.setActiveTab('document');
        if (this.selectedCommentId === payload.id.trim().toUpperCase()) {
          this.selectedCommentId = undefined;
        }
        break;
      }
      case 'comments.clearResolved': {
        shouldRefreshDiagnostics = false;
        const document = getActiveMarkdownDocument(true);
        if (!document) {
          break;
        }
        const result = await clearResolvedComments(document);
        if (result.warning) {
          void vscode.window.showWarningMessage(result.warning);
          break;
        }
        this.setActiveTab('document');
        if (!this.selectedCommentId) {
          break;
        }
        const afterClear = buildSidebarCommentsState(document.uri.toString(), this.selectedCommentId);
        if (!afterClear.selectedId) {
          this.selectedCommentId = undefined;
        }
        if (result.removed > 0) {
          void vscode.window.showInformationMessage(`Cleared ${result.removed} resolved comment${result.removed === 1 ? '' : 's'}.`);
        } else {
          void vscode.window.showInformationMessage('No resolved comments to clear.');
        }
        break;
      }
      case 'doc.copyCleanText': {
        shouldRefreshDiagnostics = false;
        const document = getActiveMarkdownDocument(false);
        if (!document) {
          break;
        }
        const withoutComments = await getDocumentContentWithoutComments(document, { showWarning: true });
        const withoutFrontmatter = withoutComments.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
        const clean = withoutFrontmatter.trim();
        await vscode.env.clipboard.writeText(clean);
        void vscode.window.showInformationMessage('Copied leaf text to clipboard (without metadata or comments).');
        break;
      }
      default:
        return;
    }

    if (shouldRefreshDiagnostics) {
      await refreshVisibleMarkdownDocuments(this.indexService, this.diagnostics);
    }
    await this.refresh();
  }

  private resolveEffectiveTab(
    requestedTab: SidebarViewTab,
    canShowOverview: boolean,
    canShowExplore: boolean
  ): SidebarViewTab {
    if (requestedTab === 'overview' && !canShowOverview) {
      return 'document';
    }

    if (requestedTab === 'explore' && !canShowExplore) {
      return 'document';
    }

    return requestedTab;
  }

  private buildDetachedDocumentTabState(
    activeEditorPath: string,
    options?: { requireExplicitDetach?: boolean }
  ): SidebarState | undefined {
    if (this.activeTab !== 'document') {
      return undefined;
    }

    const snapshot = this.lastDocumentTabSnapshot;
    if (!snapshot || !snapshot.documentPath) {
      return undefined;
    }
    if (options?.requireExplicitDetach && !snapshot.documentTabDetached) {
      return undefined;
    }

    const sameAsActiveEditor = !!activeEditorPath
      && path.resolve(activeEditorPath) === path.resolve(snapshot.documentPath);
    if (sameAsActiveEditor) {
      return undefined;
    }

    const effectiveTab = this.resolveEffectiveTab(this.activeTab, snapshot.canShowOverview, snapshot.showExplorer);
    this.activeTab = effectiveTab;
    if (effectiveTab !== 'document') {
      return undefined;
    }

    return {
      ...snapshot,
      hasActiveMarkdown: false,
      showDocumentTab: true,
      activeEditorPath,
      documentTabDetached: true,
      activeTab: effectiveTab,
      canPinAllFromFile: false,
      explorerCanGoBack: this.canExplorerGoBack(),
      explorerCanGoForward: this.canExplorerGoForward(),
      globalCanGoBack: this.canGlobalGoBack(),
      globalCanGoForward: this.canGlobalGoForward(),
      explorerCanGoHome: this.canExplorerGoHome(),
      explorerLoadToken: this.explorerLoadToken
    };
  }

  private collectSidebarWarnings(
    projectContext: { issues: ProjectConfigIssue[] } | undefined,
    overviewSkippedFiles: number
  ): string[] {
    const warnings: string[] = [];
    const issueCount = projectContext?.issues.length ?? 0;
    if (issueCount > 0) {
      warnings.push(
        `stego-project.json has ${issueCount} issue${issueCount === 1 ? '' : 's'}. `
        + `Using safe defaults where needed. See "${PROJECT_HEALTH_CHANNEL}" output.`
      );
    }

    if (overviewSkippedFiles > 0) {
      warnings.push(
        `Overview skipped ${overviewSkippedFiles} leaf file${overviewSkippedFiles === 1 ? '' : 's'} `
        + `due to read/parse errors. See "${PROJECT_HEALTH_CHANNEL}" output.`
      );
    }

    return warnings;
  }

  private async buildOverviewState(projectContext: {
    projectDir: string;
    projectTitle?: string;
    requiredMetadata: string[];
    issues: ProjectConfigIssue[];
  }): Promise<OverviewBuildResult> {
    const manuscriptFiles = (await collectManuscriptMarkdownFiles(projectContext.projectDir))
      .sort((a, b) => this.compareManuscriptFiles(a, b));
    const cache = this.getOverviewCache(projectContext.projectDir);
    if (manuscriptFiles.length === 0) {
      return {
        overview: {
          manuscriptTitle: projectContext.projectTitle?.trim() || path.basename(projectContext.projectDir),
          generatedAt: new Date().toISOString(),
          wordCount: 0,
          manuscriptFileCount: 0,
          missingRequiredMetadataCount: 0,
          unresolvedCommentsCount: 0,
          gateSnapshot: this.getGateSnapshot(projectContext.projectDir),
          stageBreakdown: [],
          mapRows: []
        },
        skippedFiles: 0
      };
    }

    let wordCount = 0;
    let missingRequiredMetadataCount = 0;
    let unresolvedCommentsCount = 0;
    let skippedFiles = 0;
    const stageCounts = new Map<string, number>();
    const mapRows: SidebarOverviewState['mapRows'] = [];
    let firstUnresolvedComment: SidebarOverviewState['firstUnresolvedComment'];
    let firstMissingMetadata: SidebarOverviewState['firstMissingMetadata'];

    for (const filePath of manuscriptFiles) {
      let stat: { mtimeMs: number };
      try {
        stat = await fs.stat(filePath);
      } catch (error) {
        skippedFiles += 1;
        logProjectHealthIssue('overview', 'Skipped leaf file (stat failed).', {
          projectFilePath: path.join(projectContext.projectDir, 'stego-project.json'),
          filePath,
          detail: errorToMessage(error)
        });
        continue;
      }

      const cached = cache.get(filePath);
      let frontmatter: Record<string, unknown>;
      let unresolvedCount: number;
      let firstUnresolvedCommentId: string | undefined;
      let status: string;

      if (cached && cached.mtimeMs === stat.mtimeMs) {
        frontmatter = cached.frontmatter;
        wordCount += cached.wordCount;
        unresolvedCount = cached.unresolvedCount;
        firstUnresolvedCommentId = cached.firstUnresolvedCommentId;
        status = cached.status;
      } else {
        let text = '';
        try {
          text = await fs.readFile(filePath, 'utf8');
        } catch (error) {
          skippedFiles += 1;
          cache.delete(filePath);
          logProjectHealthIssue('overview', 'Skipped leaf file (read failed).', {
            projectFilePath: path.join(projectContext.projectDir, 'stego-project.json'),
            filePath,
            detail: errorToMessage(error)
          });
          continue;
        }

        try {
          const commentState = await readCommentStateForFile(filePath, { showWarning: false });
          const contentWithoutComments = commentState.state
            ? commentState.state.contentWithoutComments
            : stripStegoCommentsAppendix(text);
          const parsed = parseMarkdownDocument(contentWithoutComments);
          frontmatter = parsed.frontmatter;
          const fileWordCount = countOverviewWords(parsed.body);
          wordCount += fileWordCount;

          unresolvedCount = commentState.state?.unresolvedCount ?? 0;
          firstUnresolvedCommentId = commentState.state?.comments.find((comment) => comment.status === 'open')?.id;

          const statusRaw = frontmatter.status;
          status = statusRaw === null || statusRaw === undefined || String(statusRaw).trim().length === 0
            ? '(missing)'
            : String(statusRaw).trim().toLowerCase();

          cache.set(filePath, {
            mtimeMs: stat.mtimeMs,
            frontmatter,
            wordCount: fileWordCount,
            unresolvedCount,
            firstUnresolvedCommentId,
            status
          });
        } catch (error) {
          skippedFiles += 1;
          cache.delete(filePath);
          logProjectHealthIssue('overview', 'Skipped leaf file (parse failed).', {
            projectFilePath: path.join(projectContext.projectDir, 'stego-project.json'),
            filePath,
            detail: errorToMessage(error)
          });
          continue;
        }
      }

      let fileMissingMetadata = false;
      for (const key of projectContext.requiredMetadata) {
        const value = frontmatter[key];
        if (value === null || value === undefined || String(value).trim().length === 0) {
          missingRequiredMetadataCount += 1;
          fileMissingMetadata = true;
        }
      }

      if (!firstMissingMetadata && fileMissingMetadata) {
        firstMissingMetadata = {
          filePath,
          fileLabel: path.basename(filePath)
        };
      }

      stageCounts.set(status, (stageCounts.get(status) ?? 0) + 1);

      mapRows.push({
        kind: 'file',
        filePath,
        fileLabel: path.basename(filePath),
        status
      });

      unresolvedCommentsCount += unresolvedCount;

      if (!firstUnresolvedComment && firstUnresolvedCommentId) {
        firstUnresolvedComment = {
          filePath,
          fileLabel: path.basename(filePath),
          commentId: firstUnresolvedCommentId
        };
      }
    }

    for (const cachedPath of [...cache.keys()]) {
      if (!manuscriptFiles.includes(cachedPath)) {
        cache.delete(cachedPath);
      }
    }

    const stageBreakdown = [...stageCounts.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => compareOverviewStatus(a.status, b.status));

    return {
      overview: {
        manuscriptTitle: projectContext.projectTitle?.trim() || path.basename(projectContext.projectDir),
        generatedAt: new Date().toISOString(),
        wordCount,
        manuscriptFileCount: manuscriptFiles.length,
        missingRequiredMetadataCount,
        unresolvedCommentsCount,
        gateSnapshot: this.getGateSnapshot(projectContext.projectDir),
        stageBreakdown,
        mapRows,
        firstUnresolvedComment,
        firstMissingMetadata
      },
      skippedFiles
    };
  }

  private getOverviewCache(projectDir: string): OverviewFileCache {
    let cache = this.overviewFileCache.get(projectDir);
    if (!cache) {
      cache = new Map();
      this.overviewFileCache.set(projectDir, cache);
    }
    return cache;
  }

  private getGateSnapshot(projectDir: string): SidebarOverviewGateSnapshot {
    const existing = this.gateSnapshotByProject.get(projectDir);
    if (existing) {
      return existing;
    }

    const empty: SidebarOverviewGateSnapshot = {
      stageCheck: { state: 'never' },
      build: { state: 'never' }
    };
    this.gateSnapshotByProject.set(projectDir, empty);
    return empty;
  }

  private updateGateSnapshot(
    projectDir: string | undefined,
    key: 'stageCheck' | 'build',
    state: 'success' | 'failed',
    detail?: string,
    stage?: string
  ): void {
    if (!projectDir) {
      return;
    }

    const snapshot = this.getGateSnapshot(projectDir);
    const normalizedDetail = detail?.trim();
    const warningOnly = state === 'failed' && normalizedDetail ? this.isWarningOnlyGateDetail(normalizedDetail) : false;
    const nextState: 'success' | 'failed' = warningOnly ? 'success' : state;
    snapshot[key] = {
      state: nextState,
      updatedAt: new Date().toISOString(),
      detail: normalizedDetail,
      detailKind: normalizedDetail
        ? (warningOnly
          ? 'warning'
          : (nextState === 'failed'
            ? 'error'
            : (key === 'build' ? 'output' : undefined)))
        : undefined,
      stage: key === 'stageCheck' && stage ? stage : undefined
    };
  }

  private isWarningOnlyGateDetail(detail: string): boolean {
    const text = detail.trim().toLowerCase();
    if (!text) {
      return false;
    }

    const hasWarning = /\bwarn(?:ing|ings)?\b/.test(text);
    if (!hasWarning) {
      return false;
    }

    const hasError = /\berr(?:or|ors)?\b|\bfailed?\b|\bfailure\b|\bexception\b/.test(text);
    return !hasError;
  }

  private async getCurrentProjectContext(): Promise<{ projectDir: string } | undefined> {
    const projectContext = await this.getCurrentProjectConfigContext();
    return projectContext ? { projectDir: projectContext.projectDir } : undefined;
  }

  private async getCurrentProjectConfigContext(): Promise<ProjectScanContext | undefined> {
    const document = getActiveMarkdownDocument(false);
    if (document) {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
      if (!workspaceFolder) {
        return undefined;
      }

      return findNearestProjectConfig(document.uri.fsPath, workspaceFolder.uri.fsPath);
    }

    const fallbackDocumentPath = this.lastRenderedState?.documentPath || this.lastDocumentTabSnapshot?.documentPath;
    if (!fallbackDocumentPath) {
      return undefined;
    }

    const fallbackUri = vscode.Uri.file(fallbackDocumentPath);
    const fallbackWorkspaceFolder = vscode.workspace.getWorkspaceFolder(fallbackUri);
    if (!fallbackWorkspaceFolder) {
      return undefined;
    }

    return findNearestProjectConfig(fallbackDocumentPath, fallbackWorkspaceFolder.uri.fsPath);
  }

  private async promptAndAddBranch(): Promise<void> {
    const projectContext = await this.getCurrentProjectConfigContext();
    if (!projectContext) {
      void vscode.window.showWarningMessage('Open a project file first to add a branch.');
      return;
    }

    const existingBranchIds = new Set(
      projectContext.branches.map((branch) => branch.id.trim().toLowerCase()).filter((value) => value.length > 0)
    );
    const parentId = this.getCurrentExplorerBranchId();
    const parentLabel = parentId || 'content';

    const branchName = await vscode.window.showInputBox({
      title: 'New Branch',
      prompt: `Branch path relative to ${parentLabel}`,
      placeHolder: 'characters or characters/minor',
      ignoreFocusOut: true,
      validateInput: (value) => {
        const id = this.toBranchId(value, parentId);
        if (!id) {
          return 'Enter a branch name using letters, numbers, dashes, or slashes.';
        }
        if (existingBranchIds.has(id.toLowerCase())) {
          return `Branch '${id}' already exists.`;
        }
        return undefined;
      }
    });
    if (branchName === undefined) {
      return;
    }

    const id = this.toBranchId(branchName, parentId);
    if (!id) {
      void vscode.window.showErrorMessage('Could not derive a valid branch path from the provided name.');
      return;
    }
    if (existingBranchIds.has(id.toLowerCase())) {
      void vscode.window.showWarningMessage(`Branch '${id}' already exists.`);
      return;
    }

    const label = this.toBranchHeadingFromId(path.basename(id));
    const metadataPath = path.join(projectContext.projectDir, CONTENT_DIR, ...id.split('/'), '_branch.md');
    const referenceDir = path.dirname(metadataPath);
    const branchDoc = [
      '---',
      `label: ${label}`,
      '---',
      '',
      `# ${label}`,
      ''
    ].join('\n');

    try {
      await fs.mkdir(referenceDir, { recursive: true });
      try {
        await fs.stat(metadataPath);
      } catch {
        await fs.writeFile(metadataPath, branchDoc, 'utf8');
      }
    } catch (error) {
      void vscode.window.showErrorMessage(`Could not add branch: ${errorToMessage(error)}`);
      return;
    }

    this.indexService.clear();
    this.referenceUsageService.clear();

    this.setActiveTab('explore');
    this.navigateExplorerToRoute({ kind: 'branch', id }, { trackHistory: true });
    try {
      await openBacklinkFile(metadataPath, 1);
    } catch (error) {
      void vscode.window.showWarningMessage(`Added branch, but could not open its notes file: ${errorToMessage(error)}`);
    }
    void vscode.window.showInformationMessage(`Added branch '${id}'.`);
  }

  private toBranchId(name: string, parentId = ''): string {
    const normalized = name
      .trim()
      .split('/')
      .map((segment) => segment
        .trim()
        .toLowerCase()
        .replace(/['’]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-{2,}/g, '-'))
      .filter((segment) => segment.length > 0);
    if (normalized.length === 0) {
      return '';
    }
    return parentId ? `${parentId}/${normalized.join('/')}` : normalized.join('/');
  }

  private getCurrentExplorerBranchId(): string {
    if (this.explorerRoute.kind === 'branch') {
      return this.explorerRoute.id;
    }
    const page = this.lastRenderedState?.explorer;
    if (page?.kind === 'identifier' && page.branch?.id) {
      return page.branch.id;
    }
    return '';
  }

  private toBranchHeadingFromId(id: string): string {
    const normalized = id.replace(/[_-]+/g, ' ').trim();
    if (!normalized) {
      return 'Branch';
    }
    return normalized.replace(/\b\w/g, (value) => value.toUpperCase());
  }

  private parseJson<T>(text: string): T | undefined {
    const trimmed = text.trim();
    if (!trimmed) {
      return undefined;
    }

    try {
      return JSON.parse(trimmed) as T;
    } catch {
      return undefined;
    }
  }

}

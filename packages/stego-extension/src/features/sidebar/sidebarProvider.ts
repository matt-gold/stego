import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fs } from 'fs';
import { DEFAULT_IDENTIFIER_PATTERN } from '../../shared/constants';
import { errorToMessage } from '../../shared/errors';
import { asNumber, asRecord } from '../../shared/value';
import type {
  ExplorerRoute,
  ProjectBibleCategory,
  SidebarCommentsState,
  SidebarState
} from '../../shared/types';
import { runLocalValidateWorkflow } from '../commands/localValidateWorkflow';
import { openMarkdownPreviewCommand } from '../commands/openMarkdownPreview';
import { toggleFrontmatterFold } from '../commands/frontmatterFold';
import { refreshVisibleMarkdownDocuments } from '../diagnostics/refreshDiagnostics';
import { BibleIndexService } from '../indexing/bibleIndexService';
import { ReferenceUsageIndexService } from '../indexing/referenceUsageIndexService';
import {
  promptAndAddMetadataArrayItem,
  promptAndAddMetadataField,
  promptAndEditMetadataArrayItem,
  promptAndEditMetadataField,
  removeMetadataArrayItem,
  removeMetadataField,
  setMetadataStatus,
  getActiveMarkdownDocument
} from '../metadata/frontmatterEdit';
import { parseMarkdownDocument } from '../metadata/frontmatterParse';
import { buildStatusControl } from '../metadata/statusControl';
import { openBacklinkFile, openExternalLink, openLineInActiveDocument } from '../navigation/openTargets';
import { findNearestProjectConfig, getConfig } from '../project/projectConfig';
import { collectManuscriptMarkdownFiles, resolveCurrentBibleCategoryFile } from '../project/fileScan';
import { buildExplorerState, buildMetadataEntry, buildTocWithBacklinks } from './sidebarStateBuilder';
import { normalizeExplorerRoute, isSameExplorerRoute } from './sidebarRoutes';
import { collectTocEntries, isManuscriptPath } from './sidebarToc';
import { renderSidebarHtml } from './render/renderSidebarHtml';
import { parseCommentAppendix } from '../comments/commentParser';
import {
  addCommentAtSelection,
  buildSidebarCommentsState,
  clearResolvedComments,
  deleteComment,
  jumpToComment,
  normalizeAuthor,
  replyToComment,
  toggleCommentResolved
} from '../comments/commentStore';

export class MetadataSidebarProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private backlinkFilter = '';
  private metadataEditing = false;
  private activeTab: 'document' | 'comments' = 'document';
  private selectedCommentId?: string;
  private explorerRoute: ExplorerRoute = { kind: 'home' };
  private explorerCollapsed = false;
  private readonly explorerBackStack: ExplorerRoute[] = [];
  private readonly explorerForwardStack: ExplorerRoute[] = [];
  private explorerBacklinksExpanded = false;
  private explorerLoadToken = 0;
  private readonly expandedTocBacklinks = new Set<string>();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly indexService: BibleIndexService,
    private readonly referenceUsageService: ReferenceUsageIndexService,
    private readonly diagnostics: vscode.DiagnosticCollection
  ) {}

  public async focusIdentifier(id: string): Promise<void> {
    const normalized = id.trim().toUpperCase();
    if (!normalized) {
      return;
    }

    this.navigateExplorerToRoute({ kind: 'identifier', id: normalized }, { trackHistory: true });
    await this.refresh();
  }

  public async focusComment(id: string): Promise<void> {
    const normalized = id.trim().toUpperCase();
    if (!normalized) {
      return;
    }

    this.activeTab = 'comments';
    this.selectedCommentId = normalized;
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

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true
    };

    webviewView.webview.onDidReceiveMessage((message: unknown) => {
      void this.handleMessage(message);
    });

    void this.refresh();
  }

  public async refresh(): Promise<void> {
    if (!this.view) {
      return;
    }

    const state = await this.getSidebarState();
    this.view.webview.html = renderSidebarHtml(this.view.webview, state, this.extensionUri);
  }

  private async getSidebarState(): Promise<SidebarState> {
    const document = getActiveMarkdownDocument(false);
    if (!document) {
      return {
        hasActiveMarkdown: false,
        documentPath: '',
        structureSummary: undefined,
        activeTab: this.activeTab,
        showExplorer: false,
        metadataEditing: false,
        enableComments: true,
        statusControl: undefined,
        metadataEntries: [],
        explorer: undefined,
        explorerCollapsed: this.explorerCollapsed,
        explorerCanGoBack: this.canExplorerGoBack(),
        explorerCanGoForward: this.canExplorerGoForward(),
        explorerCanGoHome: this.canExplorerGoHome(),
        explorerLoadToken: this.explorerLoadToken,
        tocEntries: [],
        showToc: false,
        isBibleCategoryFile: false,
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

    const enableComments = getConfig('comments', document.uri).get<boolean>('enable', true) !== false;
    const effectiveTab = !enableComments && this.activeTab === 'comments' ? 'document' : this.activeTab;

    const emptyComments: SidebarCommentsState = {
      selectedId: undefined,
      currentAuthor: undefined,
      items: [],
      parseErrors: [],
      totalCount: 0,
      unresolvedCount: 0
    };

    const comments = enableComments
      ? buildSidebarCommentsState(document.getText(), this.selectedCommentId)
      : emptyComments;
    comments.currentAuthor = normalizeAuthor(getConfig('comments', document.uri).get<string>('author', '') ?? '');
    this.selectedCommentId = comments.selectedId;

    const tocEntries = collectTocEntries(document);
    const manuscriptMode = isManuscriptPath(document.uri.fsPath);

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const projectContext = workspaceFolder
      ? await findNearestProjectConfig(document.uri.fsPath, workspaceFolder.uri.fsPath)
      : undefined;

    const categoryByKey = new Map<string, ProjectBibleCategory>();
    const categoryOrderByKey = new Map<string, number>();
    const structuralOrderByKey = new Map<string, number>();
    let structuralOrder = 0;
    for (const key of projectContext?.structuralKeys ?? []) {
      structuralOrderByKey.set(key, structuralOrder);
      structuralOrder += 1;
    }

    let categoryOrder = 0;
    for (const category of projectContext?.categories ?? []) {
      categoryByKey.set(category.key, category);
      categoryOrderByKey.set(category.key, categoryOrder);
      categoryOrder += 1;
    }

    let bibleCategoryForFile: ProjectBibleCategory | undefined;
    if (!manuscriptMode && projectContext) {
      bibleCategoryForFile = await resolveCurrentBibleCategoryFile(projectContext.projectDir, projectContext.categories, document.uri.fsPath);
    }

    const index = await this.indexService.loadForDocument(document);
    const pattern = getConfig('bible', document.uri).get<string>('identifierPattern', DEFAULT_IDENTIFIER_PATTERN);
    const showExplorer = (projectContext?.categories.length ?? 0) > 0;
    const explorer = showExplorer
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
    const tocWithBacklinks = await buildTocWithBacklinks(
      tocEntries,
      bibleCategoryForFile,
      projectContext,
      document,
      index,
      pattern,
      this.backlinkFilter,
      this.expandedTocBacklinks,
      this.referenceUsageService
    );

    if (!manuscriptMode) {
      return {
        hasActiveMarkdown: true,
        documentPath: document.uri.fsPath,
        structureSummary: undefined,
        activeTab: effectiveTab,
        mode: 'nonManuscript',
        showExplorer,
        metadataEditing: false,
        enableComments,
        statusControl: undefined,
        metadataEntries: [],
        explorer,
        explorerCollapsed: this.explorerCollapsed,
        explorerCanGoBack: this.canExplorerGoBack(),
        explorerCanGoForward: this.canExplorerGoForward(),
        explorerCanGoHome: this.canExplorerGoHome(),
        explorerLoadToken: this.explorerLoadToken,
        tocEntries: tocWithBacklinks,
        showToc: true,
        isBibleCategoryFile: !!bibleCategoryForFile,
        backlinkFilter: this.backlinkFilter,
        comments
      };
    }

    try {
      const parsed = parseMarkdownDocument(document.getText());
      const structureSummary = await this.resolveStructureSummary(document, parsed.frontmatter, projectContext);
      const statusControl = await buildStatusControl(parsed.frontmatter, document);
      const metadataEntries = Object.entries(parsed.frontmatter)
        .filter(([key]) => key !== 'status')
        .sort(([a], [b]) => {
          const aIsStructural = structuralOrderByKey.has(a);
          const bIsStructural = structuralOrderByKey.has(b);
          const aIsBibleCategory = categoryByKey.has(a);
          const bIsBibleCategory = categoryByKey.has(b);

          if (aIsStructural !== bIsStructural) {
            return aIsStructural ? -1 : 1;
          }

          if (aIsStructural && bIsStructural) {
            const aOrder = structuralOrderByKey.get(a) ?? Number.MAX_SAFE_INTEGER;
            const bOrder = structuralOrderByKey.get(b) ?? Number.MAX_SAFE_INTEGER;
            if (aOrder !== bOrder) {
              return aOrder - bOrder;
            }
          }

          if (aIsBibleCategory !== bIsBibleCategory) {
            return aIsBibleCategory ? -1 : 1;
          }

          if (aIsBibleCategory && bIsBibleCategory) {
            const aOrder = categoryOrderByKey.get(a) ?? Number.MAX_SAFE_INTEGER;
            const bOrder = categoryOrderByKey.get(b) ?? Number.MAX_SAFE_INTEGER;
            if (aOrder !== bOrder) {
              return aOrder - bOrder;
            }
          }

          return a.localeCompare(b);
        })
        .map(([key, value]) => buildMetadataEntry(
          key,
          value,
          structuralOrderByKey.has(key),
          categoryByKey.get(key),
          index,
          document,
          pattern
        ));

      return {
        hasActiveMarkdown: true,
        documentPath: document.uri.fsPath,
        structureSummary,
        activeTab: effectiveTab,
        mode: 'manuscript',
        showExplorer,
        metadataEditing: this.metadataEditing,
        enableComments,
        statusControl,
        metadataEntries,
        explorer,
        explorerCollapsed: this.explorerCollapsed,
        explorerCanGoBack: this.canExplorerGoBack(),
        explorerCanGoForward: this.canExplorerGoForward(),
        explorerCanGoHome: this.canExplorerGoHome(),
        explorerLoadToken: this.explorerLoadToken,
        tocEntries: tocWithBacklinks,
        showToc: tocEntries.length > 1,
        isBibleCategoryFile: false,
        backlinkFilter: this.backlinkFilter,
        comments
      };
    } catch (error) {
      return {
        hasActiveMarkdown: true,
        documentPath: document.uri.fsPath,
        structureSummary: undefined,
        activeTab: effectiveTab,
        mode: 'manuscript',
        parseError: errorToMessage(error),
        showExplorer,
        metadataEditing: this.metadataEditing,
        enableComments,
        statusControl: undefined,
        metadataEntries: [],
        explorer,
        explorerCollapsed: this.explorerCollapsed,
        explorerCanGoBack: this.canExplorerGoBack(),
        explorerCanGoForward: this.canExplorerGoForward(),
        explorerCanGoHome: this.canExplorerGoHome(),
        explorerLoadToken: this.explorerLoadToken,
        tocEntries: tocWithBacklinks,
        showToc: tocEntries.length > 1,
        isBibleCategoryFile: false,
        backlinkFilter: this.backlinkFilter,
        comments
      };
    }
  }

  private async resolveStructureSummary(
    document: vscode.TextDocument,
    frontmatter: Record<string, unknown>,
    projectContext: { projectDir: string; structuralLevels: { key: string; label: string; titleKey?: string; headingTemplate: string }[] } | undefined
  ): Promise<string | undefined> {
    if (!projectContext || projectContext.structuralLevels.length === 0) {
      return undefined;
    }

    const files = await collectManuscriptMarkdownFiles(projectContext.projectDir);
    if (files.length === 0) {
      return this.formatStructureSummary(projectContext.structuralLevels, frontmatter);
    }

    const normalizedCurrent = path.resolve(document.uri.fsPath);
    const sorted = [...files].sort((a, b) => this.compareManuscriptFiles(a, b));
    const currentIndex = sorted.findIndex((filePath) => path.resolve(filePath) === normalizedCurrent);
    if (currentIndex < 0) {
      return this.formatStructureSummary(projectContext.structuralLevels, frontmatter);
    }

    const effective = new Map<string, string>();
    const effectiveTitles = new Map<string, string>();
    for (let index = 0; index <= currentIndex; index += 1) {
      const filePath = sorted[index];
      const sourceFrontmatter = index === currentIndex
        ? frontmatter
        : await this.readFrontmatterFromDisk(filePath);

      for (const level of projectContext.structuralLevels) {
        const value = this.toScalarString(sourceFrontmatter[level.key]);
        if (value) {
          effective.set(level.key, value);
        }

        if (level.titleKey) {
          const title = this.toScalarString(sourceFrontmatter[level.titleKey]);
          if (title) {
            effectiveTitles.set(level.key, title);
          }
        }
      }
    }

    const parts = projectContext.structuralLevels
      .map((level) => {
        const value = effective.get(level.key);
        if (!value) {
          return '';
        }

        const title = effectiveTitles.get(level.key);
        return this.formatStructureHeading(level, value, title);
      })
      .filter((value) => value.length > 0);

    return parts.length > 0 ? parts.join(', ') : undefined;
  }

  private async readFrontmatterFromDisk(filePath: string): Promise<Record<string, unknown>> {
    try {
      const text = await fs.readFile(filePath, 'utf8');
      return parseMarkdownDocument(text).frontmatter;
    } catch {
      return {};
    }
  }

  private formatStructureSummary(
    levels: { key: string; label: string; titleKey?: string; headingTemplate: string }[],
    frontmatter: Record<string, unknown>
  ): string | undefined {
    const parts = levels
      .map((level) => {
        const value = this.toScalarString(frontmatter[level.key]);
        if (!value) {
          return '';
        }

        const title = level.titleKey ? this.toScalarString(frontmatter[level.titleKey]) : undefined;
        return this.formatStructureHeading(level, value, title);
      })
      .filter((value) => value.length > 0);

    return parts.length > 0 ? parts.join(', ') : undefined;
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

  private toScalarString(value: unknown): string | undefined {
    if (value === null || value === undefined || Array.isArray(value)) {
      return undefined;
    }

    const normalized = String(value).trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private formatStructureHeading(
    level: { label: string; headingTemplate: string },
    value: string,
    title?: string
  ): string {
    const normalizedTitle = title?.trim() || '';
    if (!normalizedTitle && level.headingTemplate === '{label} {value}: {title}') {
      return `${level.label} ${value}`;
    }

    return level.headingTemplate
      .replaceAll('{label}', level.label)
      .replaceAll('{value}', value)
      .replaceAll('{title}', normalizedTitle)
      .replace(/\s+/g, ' ')
      .replace(/:\s*$/, '')
      .trim();
  }

  private async handleMessage(message: unknown): Promise<void> {
    const payload = asRecord(message);
    if (!payload || typeof payload.type !== 'string') {
      return;
    }

    let shouldRefreshDiagnostics = true;

    switch (payload.type) {
      case 'setSidebarTab': {
        shouldRefreshDiagnostics = false;
        const value = typeof payload.value === 'string' ? payload.value.trim().toLowerCase() : '';
        if (value === 'document' || value === 'comments') {
          if (value === 'comments') {
            const doc = getActiveMarkdownDocument(false);
            if (doc && !getConfig('comments', doc.uri).get<boolean>('enable', true)) {
              break;
            }
          }
          this.activeTab = value;
        }
        break;
      }
      case 'addMetadataField': {
        await promptAndAddMetadataField();
        break;
      }
      case 'editMetadataField': {
        if (typeof payload.key === 'string' && payload.key.trim().length > 0) {
          await promptAndEditMetadataField(payload.key.trim());
        }
        break;
      }
      case 'removeMetadataField': {
        if (typeof payload.key === 'string' && payload.key.trim().length > 0) {
          await removeMetadataField(payload.key.trim());
        }
        break;
      }
      case 'setMetadataStatus': {
        if (typeof payload.value === 'string' && payload.value.trim().length > 0) {
          await setMetadataStatus(payload.value.trim());
        }
        break;
      }
      case 'addMetadataArrayItem': {
        if (typeof payload.key === 'string' && payload.key.trim().length > 0) {
          await promptAndAddMetadataArrayItem(payload.key.trim());
        }
        break;
      }
      case 'editMetadataArrayItem': {
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
      case 'removeMetadataArrayItem': {
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
      case 'toggleMetadataEditing': {
        shouldRefreshDiagnostics = false;
        this.metadataEditing = !this.metadataEditing;
        break;
      }
      case 'runLocalValidate': {
        shouldRefreshDiagnostics = false;
        await runLocalValidateWorkflow();
        break;
      }
      case 'openMarkdownPreview': {
        shouldRefreshDiagnostics = false;
        await openMarkdownPreviewCommand();
        break;
      }
      case 'toggleFrontmatter': {
        shouldRefreshDiagnostics = false;
        await toggleFrontmatterFold();
        break;
      }
      case 'refresh': {
        shouldRefreshDiagnostics = false;
        break;
      }
      case 'openIdentifier': {
        shouldRefreshDiagnostics = false;
        if (typeof payload.id === 'string' && payload.id.trim().length > 0) {
          this.navigateExplorerToRoute({ kind: 'identifier', id: payload.id.trim() }, { trackHistory: true });
        }
        break;
      }
      case 'openExplorerCategory': {
        shouldRefreshDiagnostics = false;
        if (
          typeof payload.key === 'string'
          && payload.key.trim().length > 0
          && typeof payload.prefix === 'string'
          && payload.prefix.trim().length > 0
        ) {
          this.navigateExplorerToRoute(
            { kind: 'category', key: payload.key.trim(), prefix: payload.prefix.trim() },
            { trackHistory: true }
          );
        }
        break;
      }
      case 'explorerHome': {
        shouldRefreshDiagnostics = false;
        this.navigateExplorerToRoute({ kind: 'home' }, { trackHistory: true });
        break;
      }
      case 'explorerBack': {
        shouldRefreshDiagnostics = false;
        this.goExplorerBack();
        break;
      }
      case 'explorerForward': {
        shouldRefreshDiagnostics = false;
        this.goExplorerForward();
        break;
      }
      case 'toggleExplorerBacklinks': {
        shouldRefreshDiagnostics = false;
        this.explorerBacklinksExpanded = !this.explorerBacklinksExpanded;
        break;
      }
      case 'toggleExplorerCollapse': {
        shouldRefreshDiagnostics = false;
        this.explorerCollapsed = !this.explorerCollapsed;
        break;
      }
      case 'reloadIdentifierIndex': {
        shouldRefreshDiagnostics = false;
        this.indexService.clear();
        this.referenceUsageService.clear();
        await refreshVisibleMarkdownDocuments(this.indexService, this.diagnostics);
        void vscode.window.showInformationMessage('Stego Bible index rebuilt.');
        break;
      }
      case 'openTocHeading': {
        shouldRefreshDiagnostics = false;
        const line = asNumber(payload.line);
        if (line !== undefined) {
          await openLineInActiveDocument(line);
        }
        break;
      }
      case 'toggleTocBacklinks': {
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
      case 'setBacklinkFilter': {
        shouldRefreshDiagnostics = false;
        const next = typeof payload.value === 'string' ? payload.value : '';
        this.backlinkFilter = next;
        break;
      }
      case 'openBacklink': {
        shouldRefreshDiagnostics = false;
        if (typeof payload.filePath === 'string') {
          const line = asNumber(payload.line) ?? 1;
          await openBacklinkFile(payload.filePath, line);
        }
        break;
      }
      case 'openExternalLink': {
        shouldRefreshDiagnostics = false;
        if (typeof payload.url === 'string' && payload.url.trim().length > 0) {
          const basePath = typeof payload.basePath === 'string' && payload.basePath.trim().length > 0
            ? payload.basePath.trim()
            : undefined;
          await openExternalLink(payload.url.trim(), basePath);
        }
        break;
      }
      case 'addComment': {
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
        this.activeTab = 'comments';
        this.selectedCommentId = result.id;
        break;
      }
      case 'openCommentThread': {
        shouldRefreshDiagnostics = false;
        if (typeof payload.id === 'string' && payload.id.trim().length > 0) {
          this.activeTab = 'comments';
          this.selectedCommentId = payload.id.trim().toUpperCase();
        }
        break;
      }
      case 'replyComment': {
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
        this.activeTab = 'comments';
        this.selectedCommentId = result.id ?? payload.id.trim().toUpperCase();
        break;
      }
      case 'toggleCommentResolved': {
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
        this.activeTab = 'comments';
        this.selectedCommentId = payload.id.trim().toUpperCase();
        break;
      }
      case 'jumpToComment': {
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
      case 'deleteComment': {
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
        this.activeTab = 'comments';
        if (this.selectedCommentId === payload.id.trim().toUpperCase()) {
          this.selectedCommentId = undefined;
        }
        break;
      }
      case 'clearResolvedComments': {
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
        this.activeTab = 'comments';
        if (!this.selectedCommentId) {
          break;
        }
        const afterClear = buildSidebarCommentsState(document.getText(), this.selectedCommentId);
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
      case 'copyCleanManuscript': {
        shouldRefreshDiagnostics = false;
        const document = getActiveMarkdownDocument(false);
        if (!document) {
          break;
        }
        const parsed = parseCommentAppendix(document.getText());
        const withoutComments = parsed.contentWithoutComments;
        const withoutFrontmatter = withoutComments.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
        const clean = withoutFrontmatter.trim();
        await vscode.env.clipboard.writeText(clean);
        void vscode.window.showInformationMessage('Copied manuscript text to clipboard (without metadata or comments).');
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

}

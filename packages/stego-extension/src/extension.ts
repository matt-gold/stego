import * as path from 'path';
import { promises as fs, type Dirent } from 'fs';
import { spawn } from 'child_process';
import * as vscode from 'vscode';
import * as yaml from 'js-yaml';
import MarkdownIt from 'markdown-it';

type BibleRecord = {
  title?: string;
  description?: string;
  url?: string;
  path?: string;
  anchor?: string;
};

type IdentifierMatch = {
  id: string;
  range: vscode.Range;
};

type ParsedMarkdownDocument = {
  lineEnding: string;
  hasFrontmatter: boolean;
  frontmatter: Record<string, unknown>;
  body: string;
};

type SidebarState = {
  hasActiveMarkdown: boolean;
  documentPath: string;
  mode?: 'manuscript' | 'nonManuscript';
  parseError?: string;
  showExplorer: boolean;
  metadataEditing: boolean;
  statusControl?: SidebarStatusControl;
  metadataEntries: SidebarMetadataEntry[];
  explorer?: SidebarExplorerPage;
  explorerCollapsed: boolean;
  explorerCanGoBack: boolean;
  explorerCanGoForward: boolean;
  explorerCanGoHome: boolean;
  explorerLoadToken: number;
  tocEntries: SidebarTocEntry[];
  showToc: boolean;
  isBibleCategoryFile: boolean;
  backlinkFilter: string;
};

type FrontmatterLineRange = {
  start: number;
  end: number;
};

type SidebarMetadataEntry = {
  key: string;
  isBibleCategory: boolean;
  isArray: boolean;
  valueText: string;
  references: SidebarIdentifierLink[];
  arrayItems: SidebarMetadataArrayItem[];
};

type SidebarMetadataArrayItem = {
  index: number;
  valueText: string;
  references: SidebarIdentifierLink[];
};

type SidebarStatusControl = {
  options: string[];
  value?: string;
  invalidValue?: string;
};

type SidebarIdentifierLink = {
  id: string;
  title: string;
  description: string;
  known: boolean;
  target?: string;
};

type SidebarTocEntry = {
  id: string;
  level: number;
  heading: string;
  line: number;
  anchor: string;
  identifier?: SidebarIdentifierLink;
  backlinkCount: number;
  backlinksExpanded: boolean;
  backlinks: SidebarBacklink[];
};

type SidebarBacklink = {
  filePath: string;
  fileLabel: string;
  line: number;
  excerpt: string;
  count: number;
};

type SidebarExplorerEntry = {
  id: string;
  known: boolean;
  title: string;
  description: string;
  sourceHeading?: string;
  sourceBody?: string;
  sourceFilePath?: string;
  sourceFileLabel?: string;
  sourceLine?: number;
  backlinks: SidebarBacklink[];
  backlinksExpanded: boolean;
};

type SidebarExplorerCategorySummary = {
  key: string;
  prefix: string;
  label: string;
  count: number;
};

type SidebarExplorerCategoryItem = {
  id: string;
  title: string;
  description: string;
  known: boolean;
};

type SidebarExplorerHomePage = {
  kind: 'home';
  categories: SidebarExplorerCategorySummary[];
};

type SidebarExplorerCategoryPage = {
  kind: 'category';
  category: SidebarExplorerCategorySummary;
  items: SidebarExplorerCategoryItem[];
};

type SidebarExplorerIdentifierPage = {
  kind: 'identifier';
  category?: SidebarExplorerCategorySummary;
  entry: SidebarExplorerEntry;
};

type SidebarExplorerPage = SidebarExplorerHomePage | SidebarExplorerCategoryPage | SidebarExplorerIdentifierPage;

type ExplorerRoute =
  | { kind: 'home' }
  | { kind: 'category'; key: string; prefix: string }
  | { kind: 'identifier'; id: string };

type BibleSectionPreview = {
  heading: string;
  body: string;
  filePath: string;
  fileLabel: string;
  line: number;
};

type ProjectBibleCategory = {
  key: string;
  prefix: string;
  notesFile?: string;
};

type ProjectScanContext = {
  projectDir: string;
  projectMtimeMs: number;
  categories: ProjectBibleCategory[];
};

type FileIdentifierUsage = {
  count: number;
  firstLine: number;
  firstExcerpt: string;
};

type IndexedFileUsage = {
  mtimeMs: number;
  identifiers: Map<string, FileIdentifierUsage>;
};

type ProjectReferenceIndex = {
  pattern: string;
  files: Map<string, IndexedFileUsage>;
  byIdentifier: Map<string, Map<string, FileIdentifierUsage>>;
};

const METADATA_VIEW_ID = 'stegoBible.metadataView';
const DEFAULT_IDENTIFIER_PATTERN = '\\b[A-Z][A-Z0-9]*-[A-Z0-9]+(?:-[A-Z0-9]+)*\\b';
const DEFAULT_ALLOWED_STATUSES = ['draft', 'revise', 'line-edit', 'proof', 'final'];
const FRONTMATTER_YAML_SCHEMA = yaml.JSON_SCHEMA;
const STORY_BIBLE_DIR = 'story-bible';
const EXPLORER_MARKDOWN_RENDERER = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true
});

class BibleIndexService {
  private readonly explicitCache = new Map<string, { mtimeMs: number; index: Map<string, BibleRecord> }>();
  private readonly inferredCache = new Map<string, { stamp: string; index: Map<string, BibleRecord> }>();

  public clear(): void {
    this.explicitCache.clear();
    this.inferredCache.clear();
  }

  public async loadForDocument(document: vscode.TextDocument): Promise<Map<string, BibleRecord>> {
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!folder) {
      return new Map();
    }

    const explicit = await this.loadExplicitIndex(folder);
    const inferred = await this.loadInferredIndex(document, folder);

    if (explicit.size === 0) {
      return inferred;
    }

    if (inferred.size === 0) {
      return explicit;
    }

    return mergeIndexes(inferred, explicit);
  }

  private async loadExplicitIndex(folder: vscode.WorkspaceFolder): Promise<Map<string, BibleRecord>> {
    const indexPath = getResolvedIndexPath(folder);
    if (!indexPath) {
      return new Map();
    }

    const cacheKey = `${folder.uri.fsPath}::${indexPath}`;
    let stat;

    try {
      stat = await fs.stat(indexPath);
    } catch {
      this.explicitCache.delete(cacheKey);
      return new Map();
    }

    const cached = this.explicitCache.get(cacheKey);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached.index;
    }

    const raw = await fs.readFile(indexPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    const index = parseIndexFile(parsed);

    this.explicitCache.set(cacheKey, { mtimeMs: stat.mtimeMs, index });
    return index;
  }

  private async loadInferredIndex(
    document: vscode.TextDocument,
    folder: vscode.WorkspaceFolder
  ): Promise<Map<string, BibleRecord>> {
    const project = await findNearestProjectConfig(document.uri.fsPath, folder.uri.fsPath);
    if (!project || project.categories.length === 0) {
      return new Map();
    }

    const scanPlan = await buildProjectScanPlan(project.projectDir, project.categories);
    if (scanPlan.files.length === 0) {
      return new Map();
    }

    const cacheKey = project.projectDir;
    const stamp = [project.projectMtimeMs.toString(), ...scanPlan.stampParts].join('|');
    const cached = this.inferredCache.get(cacheKey);
    if (cached && cached.stamp === stamp) {
      return cached.index;
    }

    const index = await buildIndexFromHeadingScan(scanPlan.files, scanPlan.prefixes, folder.uri.fsPath);
    this.inferredCache.set(cacheKey, { stamp, index });
    return index;
  }
}

class ReferenceUsageIndexService {
  private readonly cache = new Map<string, ProjectReferenceIndex>();

  public clear(): void {
    this.cache.clear();
  }

  public async getReferencesForIdentifier(
    projectDir: string,
    identifier: string,
    pattern: string,
    excludeFilePath?: string
  ): Promise<SidebarBacklink[]> {
    const grouped = await this.getReferencesForIdentifiers(projectDir, [identifier], pattern, excludeFilePath);
    return grouped.get(identifier) ?? [];
  }

  public async getReferencesForIdentifiers(
    projectDir: string,
    identifiers: string[],
    pattern: string,
    excludeFilePath?: string
  ): Promise<Map<string, SidebarBacklink[]>> {
    const index = await this.loadProjectIndex(projectDir, pattern);
    const results = new Map<string, SidebarBacklink[]>();

    for (const identifier of identifiers) {
      const files = index.byIdentifier.get(identifier);
      if (!files) {
        results.set(identifier, []);
        continue;
      }

      const backlinks: SidebarBacklink[] = [];
      for (const [filePath, usage] of files.entries()) {
        if (excludeFilePath && normalizeFsPath(excludeFilePath) === normalizeFsPath(filePath)) {
          continue;
        }

        backlinks.push({
          filePath,
          fileLabel: path.relative(projectDir, filePath).split(path.sep).join('/'),
          line: usage.firstLine,
          excerpt: usage.firstExcerpt,
          count: usage.count
        });
      }

      backlinks.sort((a, b) => a.filePath.localeCompare(b.filePath));
      results.set(identifier, backlinks);
    }

    return results;
  }

  private async loadProjectIndex(projectDir: string, pattern: string): Promise<ProjectReferenceIndex> {
    const key = path.resolve(projectDir);
    const cached = this.cache.get(key);
    if (!cached || cached.pattern !== pattern) {
      const fresh = await this.buildProjectIndex(projectDir, pattern);
      this.cache.set(key, fresh);
      return fresh;
    }

    await this.refreshProjectIndex(cached, projectDir, pattern);
    return cached;
  }

  private async buildProjectIndex(projectDir: string, pattern: string): Promise<ProjectReferenceIndex> {
    const files = await collectReferenceMarkdownFiles(projectDir);
    const index: ProjectReferenceIndex = {
      pattern,
      files: new Map(),
      byIdentifier: new Map()
    };

    for (const filePath of files) {
      const parsed = await parseFileIdentifierUsage(filePath, pattern);
      if (!parsed) {
        continue;
      }
      index.files.set(filePath, parsed);
      addFileUsageToIndex(index.byIdentifier, filePath, parsed.identifiers);
    }

    return index;
  }

  private async refreshProjectIndex(index: ProjectReferenceIndex, projectDir: string, pattern: string): Promise<void> {
    const files = await collectReferenceMarkdownFiles(projectDir);
    const currentSet = new Set(files.map((entry) => normalizeFsPath(entry)));

    for (const existingPath of [...index.files.keys()]) {
      if (currentSet.has(normalizeFsPath(existingPath))) {
        continue;
      }

      removeFileUsageFromIndex(index.byIdentifier, existingPath, index.files.get(existingPath)?.identifiers);
      index.files.delete(existingPath);
    }

    for (const filePath of files) {
      let stat;
      try {
        stat = await fs.stat(filePath);
      } catch {
        removeFileUsageFromIndex(index.byIdentifier, filePath, index.files.get(filePath)?.identifiers);
        index.files.delete(filePath);
        continue;
      }

      const existing = index.files.get(filePath);
      if (existing && existing.mtimeMs === stat.mtimeMs) {
        continue;
      }

      const parsed = await parseFileIdentifierUsage(filePath, pattern, stat.mtimeMs);
      removeFileUsageFromIndex(index.byIdentifier, filePath, existing?.identifiers);
      if (!parsed) {
        index.files.delete(filePath);
        continue;
      }

      index.files.set(filePath, parsed);
      addFileUsageToIndex(index.byIdentifier, filePath, parsed.identifiers);
    }
  }
}

class MetadataSidebarProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private backlinkFilter = '';
  private metadataEditing = false;
  private explorerRoute: ExplorerRoute = { kind: 'home' };
  private explorerCollapsed = false;
  private readonly explorerBackStack: ExplorerRoute[] = [];
  private readonly explorerForwardStack: ExplorerRoute[] = [];
  private explorerBacklinksExpanded = false;
  private explorerLoadToken = 0;
  private readonly expandedTocBacklinks = new Set<string>();

  constructor(
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
    this.view.webview.html = renderSidebarHtml(this.view.webview, state);
  }

  private async getSidebarState(): Promise<SidebarState> {
    const document = getActiveMarkdownDocument(false);
    if (!document) {
      return {
        hasActiveMarkdown: false,
        documentPath: '',
        showExplorer: false,
        metadataEditing: false,
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
        backlinkFilter: this.backlinkFilter
      };
    }

    const tocEntries = collectTocEntries(document);
    const manuscriptMode = isManuscriptPath(document.uri.fsPath);

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const projectContext = workspaceFolder
      ? await findNearestProjectConfig(document.uri.fsPath, workspaceFolder.uri.fsPath)
      : undefined;

    const categoryByKey = new Map<string, ProjectBibleCategory>();
    const categoryOrderByKey = new Map<string, number>();
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
    const config = getConfig(document.uri);
    const pattern = config.get<string>('identifierPattern', DEFAULT_IDENTIFIER_PATTERN);
    const showExplorer = (projectContext?.categories.length ?? 0) > 0;
    const explorer = showExplorer
      ? await this.buildExplorerState(document, index, projectContext, pattern)
      : undefined;
    const tocWithBacklinks = await this.buildTocWithBacklinks(
      tocEntries,
      bibleCategoryForFile,
      projectContext,
      document,
      index,
      pattern
    );

    if (!manuscriptMode) {
      return {
        hasActiveMarkdown: true,
        documentPath: document.uri.fsPath,
        mode: 'nonManuscript',
        showExplorer,
        metadataEditing: false,
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
        backlinkFilter: this.backlinkFilter
      };
    }

    try {
      const parsed = parseMarkdownDocument(document.getText());
      const statusControl = await buildStatusControl(parsed.frontmatter, document);
      const metadataEntries = Object.entries(parsed.frontmatter)
        .filter(([key]) => key !== 'status')
        .sort(([a], [b]) => {
          const aIsBibleCategory = categoryByKey.has(a);
          const bIsBibleCategory = categoryByKey.has(b);

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
        .map(([key, value]) => buildMetadataEntry(key, value, categoryByKey.get(key), index, document, pattern));

      return {
        hasActiveMarkdown: true,
        documentPath: document.uri.fsPath,
        mode: 'manuscript',
        showExplorer,
        metadataEditing: this.metadataEditing,
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
        backlinkFilter: this.backlinkFilter
      };
    } catch (error) {
      return {
        hasActiveMarkdown: true,
        documentPath: document.uri.fsPath,
        mode: 'manuscript',
        parseError: errorToMessage(error),
        showExplorer,
        metadataEditing: this.metadataEditing,
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
        backlinkFilter: this.backlinkFilter
      };
    }
  }

  private async handleMessage(message: unknown): Promise<void> {
    const payload = asRecord(message);
    if (!payload || typeof payload.type !== 'string') {
      return;
    }

    let shouldRefreshDiagnostics = true;

    switch (payload.type) {
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
        await openMarkdownPreviewForActiveDocument();
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
      default:
        return;
    }

    if (shouldRefreshDiagnostics) {
      await refreshVisibleMarkdownDocuments(this.indexService, this.diagnostics);
    }
    await this.refresh();
  }

  private async buildExplorerState(
    document: vscode.TextDocument,
    index: Map<string, BibleRecord>,
    projectContext: ProjectScanContext | undefined,
    pattern: string
  ): Promise<SidebarExplorerPage | undefined> {
    const categories = collectExplorerCategorySummaries(projectContext?.categories ?? [], index);
    const route = this.explorerRoute;

    if (route.kind === 'home') {
      return {
        kind: 'home',
        categories
      };
    }

    if (route.kind === 'category') {
      const category = categories.find((entry) => (
        entry.key === route.key
        && entry.prefix.toUpperCase() === route.prefix.toUpperCase()
      ));

      if (!category) {
        return {
          kind: 'home',
          categories
        };
      }

      const items = collectExplorerCategoryItems(route.prefix, index);
      return {
        kind: 'category',
        category,
        items
      };
    }

    const id = route.id.trim().toUpperCase();
    if (!id) {
      return {
        kind: 'home',
        categories
      };
    }

    const record = index.get(id);
    const section = await resolveBibleSectionPreview(id, record, document, projectContext);
    const title = (record?.title?.trim() || section?.heading?.trim() || id);
    const description = (record?.description?.trim() || section?.body?.trim() || '');
    const prefix = getIdentifierPrefix(id);
    const category = prefix
      ? categories.find((entry) => entry.prefix.toUpperCase() === prefix)
      : undefined;

    let backlinks: SidebarBacklink[] = [];
    if (projectContext) {
      const allBacklinks = await this.referenceUsageService.getReferencesForIdentifier(
        projectContext.projectDir,
        id,
        pattern
      );
      backlinks = applyBacklinkFilter(allBacklinks, this.backlinkFilter);
    }

    return {
      kind: 'identifier',
      category,
      entry: {
        id,
        known: !!record,
        title,
        description,
        sourceHeading: section?.heading,
        sourceBody: section?.body,
        sourceFilePath: section?.filePath,
        sourceFileLabel: section?.fileLabel,
        sourceLine: section?.line,
        backlinks,
        backlinksExpanded: this.explorerBacklinksExpanded
      }
    };
  }

  private async buildTocWithBacklinks(
    tocEntries: SidebarTocEntry[],
    bibleCategoryForFile: ProjectBibleCategory | undefined,
    projectContext: ProjectScanContext | undefined,
    document: vscode.TextDocument,
    index: Map<string, BibleRecord>,
    pattern: string
  ): Promise<SidebarTocEntry[]> {
    if (!bibleCategoryForFile || !projectContext) {
      return tocEntries;
    }

    const filteredEntries: SidebarTocEntry[] = [];
    const tocIdentifiers = tocEntries
      .map((entry) => tryParseIdentifierFromHeading(entry.heading))
      .filter((identifier): identifier is string => !!identifier && identifier.startsWith(`${bibleCategoryForFile.prefix}-`));
    const backlinksByIdentifier = await this.referenceUsageService.getReferencesForIdentifiers(
      projectContext.projectDir,
      [...new Set(tocIdentifiers)],
      pattern,
      document.uri.fsPath
    );

    for (const entry of tocEntries) {
      const identifier = tryParseIdentifierFromHeading(entry.heading);
      if (!identifier || !identifier.startsWith(`${bibleCategoryForFile.prefix}-`)) {
        filteredEntries.push(entry);
        continue;
      }

      const record = index.get(identifier);
      const backlinks = backlinksByIdentifier.get(identifier) ?? [];
      const filteredBacklinks = applyBacklinkFilter(backlinks, this.backlinkFilter);

      filteredEntries.push({
        ...entry,
        identifier: {
          id: identifier,
          title: record?.title ?? '',
          description: record?.description ?? '',
          known: !!record,
          target: resolveTarget(identifier, record, document)?.toString()
        },
        backlinkCount: filteredBacklinks.length,
        backlinksExpanded: this.expandedTocBacklinks.has(identifier),
        backlinks: filteredBacklinks
      });
    }

    return filteredEntries;
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection('stegoBible');
  const indexService = new BibleIndexService();
  const referenceUsageService = new ReferenceUsageIndexService();
  const sidebarProvider = new MetadataSidebarProvider(indexService, referenceUsageService, diagnostics);

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
    vscode.languages.registerDocumentLinkProvider(selector, {
      async provideDocumentLinks(document): Promise<vscode.DocumentLink[]> {
        const config = getConfig(document.uri);
        const pattern = config.get<string>('identifierPattern', DEFAULT_IDENTIFIER_PATTERN);
        const includeFences = config.get<boolean>('linkInCodeFences', false);
        const matches = collectIdentifiers(document, pattern, includeFences);
        if (matches.length === 0) {
          return [];
        }

        const index = await indexService.loadForDocument(document);
        const links: vscode.DocumentLink[] = [];

        for (const match of matches) {
          const link = new vscode.DocumentLink(match.range, createExploreIdentifierCommandUri(match.id));
          const record = index.get(match.id);
          if (record?.title) {
            link.tooltip = `${match.id}: ${record.title}`;
          } else {
            link.tooltip = `Explore ${match.id} in Bible sidebar`;
          }
          links.push(link);
        }

        return links;
      }
    }),
    vscode.languages.registerHoverProvider(selector, {
      async provideHover(document, position): Promise<vscode.Hover | undefined> {
        const config = getConfig(document.uri);
        if (!config.get<boolean>('enableHover', true)) {
          return undefined;
        }

        const pattern = config.get<string>('identifierPattern', DEFAULT_IDENTIFIER_PATTERN);
        const includeFences = config.get<boolean>('linkInCodeFences', false);
        const matches = collectIdentifiers(document, pattern, includeFences);
        const match = matches.find((candidate) => candidate.range.contains(position));
        if (!match) {
          return undefined;
        }

        const index = await indexService.loadForDocument(document);
        const record = index.get(match.id);

        const md = new vscode.MarkdownString();
        md.isTrusted = true;
        md.appendMarkdown(`**${match.id}**`);

        if (record?.title) {
          md.appendMarkdown(`\\n\\n${escapeMarkdown(record.title)}`);
        }

        if (record?.description) {
          md.appendMarkdown(`\\n\\n${escapeMarkdown(record.description)}`);
        }

        md.appendMarkdown(`\\n\\n[Open in Bible Browser](${createExploreIdentifierCommandUri(match.id).toString()})`);

        return new vscode.Hover(md, match.range);
      }
    }),
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

function collectIdentifiers(document: vscode.TextDocument, pattern: string, includeCodeFences: boolean): IdentifierMatch[] {
  const regex = compileGlobalRegex(pattern);
  if (!regex) {
    return [];
  }

  const matches: IdentifierMatch[] = [];
  let inFence = false;

  for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber += 1) {
    const lineText = document.lineAt(lineNumber).text;
    const trimmed = lineText.trimStart();

    if (isFenceBoundary(trimmed)) {
      inFence = !inFence;
      if (!includeCodeFences) {
        continue;
      }
    }

    if (inFence && !includeCodeFences) {
      continue;
    }

    regex.lastIndex = 0;
    for (const match of lineText.matchAll(regex)) {
      const id = match[0];
      const startCol = match.index;
      if (startCol === undefined) {
        continue;
      }

      const range = new vscode.Range(
        new vscode.Position(lineNumber, startCol),
        new vscode.Position(lineNumber, startCol + id.length)
      );

      matches.push({ id, range });
    }
  }

  return matches;
}

function collectTocEntries(document: vscode.TextDocument): SidebarTocEntry[] {
  const entries: SidebarTocEntry[] = [];

  for (let line = 0; line < document.lineCount; line += 1) {
    const text = document.lineAt(line).text;
    const match = text.match(/^(#{1,3})\s+(.+?)\s*$/);
    if (!match) {
      continue;
    }

    const heading = match[2].trim();
    entries.push({
      id: `toc-${line + 1}`,
      level: match[1].length,
      heading,
      line: line + 1,
      anchor: slugifyHeading(heading),
      backlinkCount: 0,
      backlinksExpanded: false,
      backlinks: []
    });
  }

  return entries;
}

function isManuscriptPath(filePath: string): boolean {
  const normalized = normalizeFsPath(path.resolve(filePath));
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  return parts.includes('manuscript') || parts.includes('manuscripts');
}

function tryParseIdentifierFromHeading(heading: string): string | undefined {
  const match = heading.match(/^([A-Za-z][A-Za-z0-9]*-[A-Za-z0-9][A-Za-z0-9-]*)\b/);
  return match ? match[1].toUpperCase() : undefined;
}

function normalizeExplorerRoute(route: ExplorerRoute): ExplorerRoute | undefined {
  if (route.kind === 'home') {
    return { kind: 'home' };
  }

  if (route.kind === 'category') {
    const key = route.key.trim();
    const prefix = route.prefix.trim().toUpperCase();
    if (!key || !prefix) {
      return undefined;
    }

    return { kind: 'category', key, prefix };
  }

  const id = route.id.trim().toUpperCase();
  if (!id) {
    return undefined;
  }

  return { kind: 'identifier', id };
}

function isSameExplorerRoute(a: ExplorerRoute, b: ExplorerRoute): boolean {
  if (a.kind !== b.kind) {
    return false;
  }

  if (a.kind === 'home') {
    return true;
  }

  if (a.kind === 'category' && b.kind === 'category') {
    return a.key === b.key && a.prefix === b.prefix;
  }

  return a.kind === 'identifier' && b.kind === 'identifier' && a.id === b.id;
}

function collectExplorerCategorySummaries(
  categories: ProjectBibleCategory[],
  index: Map<string, BibleRecord>
): SidebarExplorerCategorySummary[] {
  const countByPrefix = new Map<string, number>();
  for (const id of index.keys()) {
    const prefix = getIdentifierPrefix(id);
    if (!prefix) {
      continue;
    }
    countByPrefix.set(prefix, (countByPrefix.get(prefix) ?? 0) + 1);
  }

  const summaries = categories.map((category) => ({
    key: category.key,
    prefix: category.prefix,
    label: toCategoryLabel(category.key),
    count: countByPrefix.get(category.prefix) ?? 0
  }));

  summaries.sort((a, b) => a.label.localeCompare(b.label));
  return summaries;
}

function collectExplorerCategoryItems(
  prefix: string,
  index: Map<string, BibleRecord>
): SidebarExplorerCategoryItem[] {
  const normalizedPrefix = prefix.toUpperCase();
  const items: SidebarExplorerCategoryItem[] = [];

  for (const [id, record] of index.entries()) {
    if (!id.startsWith(`${normalizedPrefix}-`)) {
      continue;
    }

    items.push({
      id,
      title: record.title?.trim() || id,
      description: record.description?.trim() || '',
      known: true
    });
  }

  items.sort((a, b) => a.id.localeCompare(b.id));
  return items;
}

function toCategoryLabel(key: string): string {
  const normalized = key.replace(/[_-]+/g, ' ').trim();
  if (!normalized) {
    return key;
  }
  return normalized.replace(/\b\w/g, (value) => value.toUpperCase());
}

function buildMetadataEntry(
  key: string,
  value: unknown,
  category: ProjectBibleCategory | undefined,
  index: Map<string, BibleRecord>,
  document: vscode.TextDocument,
  pattern: string
): SidebarMetadataEntry {
  if (Array.isArray(value)) {
    const arrayItems = value.map((item, itemIndex) => ({
      index: itemIndex,
      valueText: formatMetadataValue(item),
      references: buildIdentifierLinksForValue(item, category, index, document, pattern)
    }));

    return {
      key,
      isBibleCategory: !!category,
      isArray: true,
      valueText: '',
      references: [],
      arrayItems
    };
  }

  return {
    key,
    isBibleCategory: !!category,
    isArray: false,
    valueText: formatMetadataValue(value),
    references: buildIdentifierLinksForValue(value, category, index, document, pattern),
    arrayItems: []
  };
}

async function buildStatusControl(
  frontmatter: Record<string, unknown>,
  document: vscode.TextDocument
): Promise<SidebarStatusControl> {
  const options = await resolveAllowedStatuses(document);
  const rawStatus = asString(frontmatter.status);
  if (!rawStatus) {
    return { options };
  }

  const normalizedRaw = rawStatus.toLowerCase();
  const matched = options.find((option) => option.toLowerCase() === normalizedRaw);
  if (matched) {
    return { options, value: matched };
  }

  return { options, invalidValue: rawStatus };
}

async function resolveAllowedStatuses(document: vscode.TextDocument): Promise<string[]> {
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!folder) {
    return [...DEFAULT_ALLOWED_STATUSES];
  }

  const configPath = await findNearestFileUpward(document.uri.fsPath, folder.uri.fsPath, 'writing.config.json');
  if (!configPath) {
    return [...DEFAULT_ALLOWED_STATUSES];
  }

  try {
    const raw = await fs.readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return [...DEFAULT_ALLOWED_STATUSES];
    }

    const value = (parsed as Record<string, unknown>).allowedStatuses;
    if (!Array.isArray(value)) {
      return [...DEFAULT_ALLOWED_STATUSES];
    }

    const options: string[] = [];
    const seen = new Set<string>();
    for (const entry of value) {
      if (typeof entry !== 'string') {
        continue;
      }

      const normalized = entry.trim().toLowerCase();
      if (!normalized || seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);
      options.push(normalized);
    }

    return options.length > 0 ? options : [...DEFAULT_ALLOWED_STATUSES];
  } catch {
    return [...DEFAULT_ALLOWED_STATUSES];
  }
}

async function findNearestFileUpward(
  documentPath: string,
  workspaceRoot: string,
  fileName: string
): Promise<string | undefined> {
  let current = path.dirname(path.resolve(documentPath));
  const root = path.resolve(workspaceRoot);

  while (true) {
    const candidate = path.join(current, fileName);
    if (await isFile(candidate)) {
      return candidate;
    }

    if (normalizeFsPath(current) === normalizeFsPath(root)) {
      return undefined;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }

    current = parent;
  }
}

function buildIdentifierLinksForValue(
  value: unknown,
  category: ProjectBibleCategory | undefined,
  index: Map<string, BibleRecord>,
  document: vscode.TextDocument,
  pattern: string
): SidebarIdentifierLink[] {
  if (!category) {
    return [];
  }

  const references: SidebarIdentifierLink[] = [];
  for (const id of extractIdentifierTokensFromValue(value, pattern)) {
    if (!id.startsWith(`${category.prefix}-`)) {
      continue;
    }

    const record = index.get(id);
    references.push({
      id,
      title: record?.title ?? '',
      description: record?.description ?? '',
      known: !!record,
      target: resolveTarget(id, record, document)?.toString()
    });
  }

  return references;
}

function extractIdentifierTokensFromValue(value: unknown, pattern: string): string[] {
  const values: string[] = [];
  if (typeof value === 'string') {
    values.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string') {
        values.push(item);
      }
    }
  } else {
    return [];
  }

  const result: string[] = [];
  const seen = new Set<string>();
  const regex = compileGlobalRegex(pattern);
  if (!regex) {
    return result;
  }

  for (const rawValue of values) {
    regex.lastIndex = 0;
    const matches = rawValue.match(regex) ?? [];
    for (const token of matches) {
      const normalized = token.toUpperCase();
      if (seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);
      result.push(normalized);
    }
  }

  return result;
}

function applyBacklinkFilter(backlinks: SidebarBacklink[], filter: string): SidebarBacklink[] {
  const query = filter.trim().toLowerCase();
  if (!query) {
    return backlinks;
  }

  return backlinks.filter((entry) => (
    entry.fileLabel.toLowerCase().includes(query)
    || entry.filePath.toLowerCase().includes(query)
  ));
}

function isFenceBoundary(trimmedLine: string): boolean {
  return /^(`{3,}|~{3,})/.test(trimmedLine);
}

function compileGlobalRegex(pattern: string): RegExp | undefined {
  try {
    const base = new RegExp(pattern);
    const flags = base.flags.includes('g') ? base.flags : `${base.flags}g`;
    return new RegExp(base.source, flags);
  } catch {
    return undefined;
  }
}

function parseIndexFile(parsed: unknown): Map<string, BibleRecord> {
  const index = new Map<string, BibleRecord>();

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return index;
  }

  for (const [id, value] of Object.entries(parsed)) {
    if (typeof value === 'string') {
      index.set(id, { description: value });
      continue;
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      continue;
    }

    const record = value as Record<string, unknown>;
    index.set(id, {
      title: asString(record.title),
      description: asString(record.description),
      url: asString(record.url),
      path: asString(record.path),
      anchor: asString(record.anchor)
    });
  }

  return index;
}

function mergeIndexes(base: Map<string, BibleRecord>, overrides: Map<string, BibleRecord>): Map<string, BibleRecord> {
  const merged = new Map(base);

  for (const [id, record] of overrides) {
    const existing = merged.get(id);
    merged.set(id, existing ? mergeBibleRecord(existing, record) : record);
  }

  return merged;
}

function mergeBibleRecord(base: BibleRecord, override: BibleRecord): BibleRecord {
  return {
    title: override.title ?? base.title,
    description: override.description ?? base.description,
    url: override.url ?? base.url,
    path: override.path ?? base.path,
    anchor: override.anchor ?? base.anchor
  };
}

async function findNearestProjectConfig(
  documentPath: string,
  workspaceRoot: string
): Promise<ProjectScanContext | undefined> {
  let current = path.dirname(path.resolve(documentPath));
  const root = path.resolve(workspaceRoot);

  while (true) {
    const candidate = path.join(current, 'project.json');
    const context = await readProjectConfig(candidate);
    if (context) {
      return context;
    }

    if (normalizeFsPath(current) === normalizeFsPath(root)) {
      return undefined;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }

    current = parent;
  }
}

async function readProjectConfig(projectFilePath: string): Promise<ProjectScanContext | undefined> {
  try {
    const stat = await fs.stat(projectFilePath);
    if (!stat.isFile()) {
      return undefined;
    }

    const raw = await fs.readFile(projectFilePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    const categories = extractProjectCategories(parsed);

    return {
      projectDir: path.dirname(projectFilePath),
      projectMtimeMs: stat.mtimeMs,
      categories
    };
  } catch {
    return undefined;
  }
}

function extractProjectCategories(parsed: unknown): ProjectBibleCategory[] {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return [];
  }

  const record = parsed as Record<string, unknown>;
  if (!Array.isArray(record.bibleCategories)) {
    return [];
  }

  const categories: ProjectBibleCategory[] = [];
  const seenPrefixes = new Set<string>();

  for (const item of record.bibleCategories) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }

    const category = item as Record<string, unknown>;
    const key = asString(category.key);
    if (!key || !/^[A-Za-z0-9_-]+$/.test(key)) {
      continue;
    }

    const prefix = asString(category.prefix)?.toUpperCase();
    if (!prefix || !/^[A-Z][A-Z0-9]*$/.test(prefix)) {
      continue;
    }

    if (seenPrefixes.has(prefix)) {
      continue;
    }

    seenPrefixes.add(prefix);
    categories.push({
      key,
      prefix,
      notesFile: asString(category.notesFile)
    });
  }

  return categories;
}

async function buildProjectScanPlan(
  projectDir: string,
  categories: ProjectBibleCategory[]
): Promise<{ files: string[]; prefixes: Set<string>; stampParts: string[] }> {
  const prefixes = new Set(categories.map((category) => category.prefix));
  const notesFiles: string[] = [];
  let needsGlobalScan = false;

  for (const category of categories) {
    if (!category.notesFile) {
      needsGlobalScan = true;
      continue;
    }

    const resolved = await resolveCategoryNotesFile(projectDir, category.notesFile);
    if (!resolved) {
      needsGlobalScan = true;
      continue;
    }

    notesFiles.push(resolved);
  }

  let files = uniqueResolvedPaths(notesFiles);
  if (needsGlobalScan || files.length === 0) {
    const discovered = await collectMarkdownFiles(projectDir);
    files = uniqueResolvedPaths([...files, ...discovered]);
  }

  const stampParts = await buildFileStampParts(files);
  return { files, prefixes, stampParts };
}

async function resolveCategoryNotesFile(projectDir: string, notesFile: string): Promise<string | undefined> {
  const trimmed = notesFile.trim();
  if (!trimmed || path.isAbsolute(trimmed) || /[\\/]/.test(trimmed)) {
    return undefined;
  }

  const candidate = path.join(projectDir, STORY_BIBLE_DIR, trimmed);
  return (await isFile(candidate)) ? path.resolve(candidate) : undefined;
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

function uniqueResolvedPaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const entry of paths) {
    const resolved = path.resolve(entry);
    const key = normalizeFsPath(resolved);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(resolved);
  }

  return result;
}

async function collectMarkdownFiles(rootDir: string): Promise<string[]> {
  const results: string[] = [];
  const stack = [path.resolve(rootDir)];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    if (!currentDir) {
      continue;
    }

    let entries: Dirent[];
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (!shouldSkipScanDirectory(entry.name)) {
          stack.push(fullPath);
        }
        continue;
      }

      if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        results.push(fullPath);
      }
    }
  }

  results.sort((a, b) => a.localeCompare(b));
  return results;
}

async function collectReferenceMarkdownFiles(projectDir: string): Promise<string[]> {
  const roots = [
    path.join(projectDir, 'manuscript'),
    path.join(projectDir, 'manuscripts'),
    path.join(projectDir, 'notes')
  ];

  const files: string[] = [];
  for (const root of roots) {
    if (!(await isDirectory(root))) {
      continue;
    }

    const discovered = await collectMarkdownFiles(root);
    files.push(...discovered);
  }

  return uniqueResolvedPaths(files).sort((a, b) => a.localeCompare(b));
}

async function isDirectory(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

function shouldSkipScanDirectory(name: string): boolean {
  const value = name.toLowerCase();
  return value === '.git'
    || value === 'node_modules'
    || value === '.stego'
    || value === 'dist'
    || value === 'out'
    || value === '.next'
    || value === '.vscode';
}

async function resolveCurrentBibleCategoryFile(
  projectDir: string,
  categories: ProjectBibleCategory[],
  currentFilePath: string
): Promise<ProjectBibleCategory | undefined> {
  const normalizedCurrent = normalizeFsPath(path.resolve(currentFilePath));
  for (const category of categories) {
    if (!category.notesFile) {
      continue;
    }

    const resolved = await resolveCategoryNotesFile(projectDir, category.notesFile);
    if (!resolved) {
      continue;
    }

    if (normalizeFsPath(resolved) === normalizedCurrent) {
      return category;
    }
  }

  return undefined;
}

async function buildFileStampParts(files: string[]): Promise<string[]> {
  const parts: string[] = [];

  for (const filePath of files) {
    try {
      const stat = await fs.stat(filePath);
      parts.push(`${filePath}:${stat.mtimeMs}`);
    } catch {
      parts.push(`${filePath}:missing`);
    }
  }

  return parts;
}

async function parseFileIdentifierUsage(
  filePath: string,
  pattern: string,
  knownMtimeMs?: number
): Promise<IndexedFileUsage | undefined> {
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    return undefined;
  }

  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch {
    return undefined;
  }

  const regex = compileGlobalRegex(pattern);
  if (!regex) {
    return {
      mtimeMs: knownMtimeMs ?? stat.mtimeMs,
      identifiers: new Map()
    };
  }

  const identifiers = new Map<string, FileIdentifierUsage>();
  const lines = raw.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const lineText = lines[index];
    regex.lastIndex = 0;
    for (const match of lineText.matchAll(regex)) {
      const token = match[0].toUpperCase();
      const existing = identifiers.get(token);
      if (!existing) {
        identifiers.set(token, {
          count: 1,
          firstLine: index + 1,
          firstExcerpt: summarizeLineForPreview(lineText)
        });
        continue;
      }

      existing.count += 1;
    }
  }

  return {
    mtimeMs: knownMtimeMs ?? stat.mtimeMs,
    identifiers
  };
}

function summarizeLineForPreview(lineText: string): string {
  const compact = lineText.trim().replace(/\s+/g, ' ');
  if (compact.length <= 120) {
    return compact;
  }
  return `${compact.slice(0, 117)}...`;
}

function addFileUsageToIndex(
  byIdentifier: Map<string, Map<string, FileIdentifierUsage>>,
  filePath: string,
  identifiers: Map<string, FileIdentifierUsage>
): void {
  for (const [identifier, usage] of identifiers) {
    let files = byIdentifier.get(identifier);
    if (!files) {
      files = new Map();
      byIdentifier.set(identifier, files);
    }

    files.set(filePath, usage);
  }
}

function removeFileUsageFromIndex(
  byIdentifier: Map<string, Map<string, FileIdentifierUsage>>,
  filePath: string,
  identifiers: Map<string, FileIdentifierUsage> | undefined
): void {
  if (!identifiers) {
    return;
  }

  for (const identifier of identifiers.keys()) {
    const files = byIdentifier.get(identifier);
    if (!files) {
      continue;
    }

    files.delete(filePath);
    if (files.size === 0) {
      byIdentifier.delete(identifier);
    }
  }
}

async function buildIndexFromHeadingScan(
  files: string[],
  prefixes: Set<string>,
  workspaceRoot: string
): Promise<Map<string, BibleRecord>> {
  const index = new Map<string, BibleRecord>();

  for (const filePath of files) {
    let raw: string;
    try {
      raw = await fs.readFile(filePath, 'utf8');
    } catch {
      continue;
    }

    const lines = raw.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const headingMatch = lines[i].match(/^#{1,3}\s+(.+?)\s*$/);
      if (!headingMatch) {
        continue;
      }

      const headingText = headingMatch[1].trim();
      const idMatch = headingText.match(/^([A-Za-z][A-Za-z0-9]*-[A-Za-z0-9][A-Za-z0-9-]*)\b/);
      if (!idMatch) {
        continue;
      }

      const id = idMatch[1].toUpperCase();
      const dashIndex = id.indexOf('-');
      if (dashIndex <= 0) {
        continue;
      }

      const prefix = id.slice(0, dashIndex);
      if (!prefixes.has(prefix) || index.has(id)) {
        continue;
      }

      const headingRemainder = headingText
        .slice(idMatch[1].length)
        .trim()
        .replace(/^[-:]\s*/, '');
      const description = extractHeadingDescription(lines, i + 1);
      const anchor = slugifyHeading(headingText);
      const pathValue = toWorkspacePath(workspaceRoot, filePath);

      index.set(id, {
        title: headingRemainder || id,
        description,
        path: pathValue,
        anchor
      });
    }
  }

  return index;
}

function toWorkspacePath(workspaceRoot: string, filePath: string): string {
  const relative = path.relative(workspaceRoot, filePath);
  if (!relative || relative.startsWith('..')) {
    return path.resolve(filePath);
  }

  return relative.split(path.sep).join('/');
}

function extractHeadingDescription(lines: string[], startLine: number): string | undefined {
  for (let i = startLine; i < lines.length; i += 1) {
    const raw = lines[i].trim();
    if (!raw) {
      continue;
    }

    if (/^#{1,6}\s/.test(raw)) {
      break;
    }

    if (raw.startsWith('<!--')) {
      continue;
    }

    const cleaned = raw
      .replace(/^\s*[-*+]\s+/, '')
      .replace(/^>\s?/, '')
      .trim();
    if (!cleaned) {
      continue;
    }

    if (cleaned.length <= 220) {
      return cleaned;
    }

    return `${cleaned.slice(0, 217)}...`;
  }

  return undefined;
}

function slugifyHeading(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[`*_~]/g, '')
    .replace(/[^a-z0-9\\s-]/g, '')
    .replace(/\\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveTarget(id: string, record: BibleRecord | undefined, document: vscode.TextDocument): vscode.Uri | undefined {
  const config = getConfig(document.uri);

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

function createExploreIdentifierCommandUri(id: string): vscode.Uri {
  const args = encodeURIComponent(JSON.stringify([id.toUpperCase()]));
  return vscode.Uri.parse(`command:stegoBible.exploreIdentifier?${args}`);
}

async function resolveBibleSectionPreview(
  identifier: string,
  record: BibleRecord | undefined,
  document: vscode.TextDocument,
  projectContext: ProjectScanContext | undefined
): Promise<BibleSectionPreview | undefined> {
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  const candidates: string[] = [];

  const fromRecord = resolveRecordPathToFile(record?.path, folder?.uri.fsPath);
  if (fromRecord) {
    candidates.push(fromRecord);
  }

  if (projectContext) {
    const prefix = getIdentifierPrefix(identifier);
    if (prefix) {
      const category = projectContext.categories.find((entry) => entry.prefix === prefix);
      if (category?.notesFile) {
        const notesPath = await resolveCategoryNotesFile(projectContext.projectDir, category.notesFile);
        if (notesPath) {
          candidates.push(notesPath);
        }
      }
    }
  }

  const uniqueCandidates = uniqueResolvedPaths(candidates);
  for (const filePath of uniqueCandidates) {
    const preview = await parseIdentifierSectionFromFile(filePath, identifier, projectContext?.projectDir);
    if (preview) {
      return preview;
    }
  }

  return undefined;
}

function getIdentifierPrefix(identifier: string): string | undefined {
  const dash = identifier.indexOf('-');
  if (dash <= 0) {
    return undefined;
  }

  return identifier.slice(0, dash).toUpperCase();
}

function resolveRecordPathToFile(recordPath: string | undefined, workspaceRoot: string | undefined): string | undefined {
  if (!recordPath) {
    return undefined;
  }

  if (/^(https?:)?\/\//i.test(recordPath)) {
    return undefined;
  }

  const trimmed = recordPath.trim();
  if (!trimmed) {
    return undefined;
  }

  return path.isAbsolute(trimmed)
    ? path.resolve(trimmed)
    : workspaceRoot
      ? path.resolve(path.join(workspaceRoot, trimmed))
      : undefined;
}

async function parseIdentifierSectionFromFile(
  filePath: string,
  identifier: string,
  projectDir?: string
): Promise<BibleSectionPreview | undefined> {
  if (!filePath.toLowerCase().endsWith('.md')) {
    return undefined;
  }

  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch {
    return undefined;
  }

  const lines = raw.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(#{1,6})\s+(.+?)\s*$/);
    if (!match) {
      continue;
    }

    const heading = match[2].trim();
    const headingIdentifier = tryParseIdentifierFromHeading(heading);
    if (headingIdentifier !== identifier) {
      continue;
    }

    const level = match[1].length;
    const body = collectHeadingSectionBody(lines, index + 1, level);
    const fileLabel = projectDir
      ? path.relative(projectDir, filePath).split(path.sep).join('/')
      : filePath;

    return {
      heading,
      body,
      filePath,
      fileLabel,
      line: index + 1
    };
  }

  return undefined;
}

function collectHeadingSectionBody(lines: string[], startIndex: number, headingLevel: number): string {
  const bodyLines: string[] = [];

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (headingMatch && headingMatch[1].length <= headingLevel) {
      break;
    }

    bodyLines.push(line);
  }

  while (bodyLines.length > 0 && !bodyLines[0].trim()) {
    bodyLines.shift();
  }
  while (bodyLines.length > 0 && !bodyLines[bodyLines.length - 1].trim()) {
    bodyLines.pop();
  }

  const compactLines = bodyLines.filter((line) => line.trim().length > 0).slice(0, 10);
  if (compactLines.length === 0) {
    return '';
  }

  return compactLines.join('\n');
}

function getConfig(scopeUri?: vscode.Uri): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('stegoBible', scopeUri);
}

function getResolvedIndexPath(folder: vscode.WorkspaceFolder): string | undefined {
  const config = getConfig(folder.uri);
  const configuredPath = config.get<string>('indexFile', '.stego/bible-index.json').trim();
  if (!configuredPath) {
    return undefined;
  }

  return path.isAbsolute(configuredPath) ? configuredPath : path.join(folder.uri.fsPath, configuredPath);
}

async function refreshDiagnosticsForDocument(
  document: vscode.TextDocument,
  indexService: BibleIndexService,
  diagnostics: vscode.DiagnosticCollection
): Promise<void> {
  if (document.languageId !== 'markdown') {
    diagnostics.delete(document.uri);
    return;
  }

  const config = getConfig(document.uri);
  if (!config.get<boolean>('reportUnknownIdentifiers', true)) {
    diagnostics.delete(document.uri);
    return;
  }

  const pattern = config.get<string>('identifierPattern', DEFAULT_IDENTIFIER_PATTERN);
  const includeFences = config.get<boolean>('linkInCodeFences', false);
  const matches = collectIdentifiers(document, pattern, includeFences);
  if (matches.length === 0) {
    diagnostics.set(document.uri, []);
    return;
  }

  const index = await indexService.loadForDocument(document);
  const documentDiagnostics: vscode.Diagnostic[] = [];

  for (const match of matches) {
    if (index.has(match.id)) {
      continue;
    }

    const diagnostic = new vscode.Diagnostic(
      match.range,
      `Unknown Bible identifier '${match.id}'. Add the category in project.json (bibleCategories) and define the identifier in story-bible/<notesFile>.md.`,
      vscode.DiagnosticSeverity.Warning
    );
    diagnostic.source = 'stegoBible';
    documentDiagnostics.push(diagnostic);
  }

  diagnostics.set(document.uri, documentDiagnostics);
}

async function refreshVisibleMarkdownDocuments(
  indexService: BibleIndexService,
  diagnostics: vscode.DiagnosticCollection
): Promise<void> {
  const documents = vscode.workspace.textDocuments.filter((document) => document.languageId === 'markdown');
  await Promise.all(documents.map((document) => refreshDiagnosticsForDocument(document, indexService, diagnostics)));
}

function isAnyWorkspaceIndexFile(uri: vscode.Uri): boolean {
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

function isProjectFile(uri: vscode.Uri): boolean {
  return uri.scheme === 'file' && path.basename(uri.fsPath).toLowerCase() === 'project.json';
}

function normalizeFsPath(value: string): string {
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_{}[\]()#+\-.!]/g, '\\$&');
}

async function openLineInActiveDocument(line: number): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'markdown') {
    return;
  }

  const safeLine = Math.max(1, Math.min(line, editor.document.lineCount));
  const position = new vscode.Position(safeLine - 1, 0);
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.AtTop);
}

async function openMarkdownPreviewForActiveDocument(): Promise<void> {
  const document = getActiveMarkdownDocument(true);
  if (!document) {
    return;
  }

  try {
    await vscode.commands.executeCommand('markdown.showPreviewToSide', document.uri);
  } catch {
    try {
      await vscode.commands.executeCommand('markdown.showPreview', document.uri);
    } catch (error) {
      void vscode.window.showErrorMessage(`Could not open Markdown preview: ${errorToMessage(error)}`);
    }
  }
}

async function openBacklinkFile(filePath: string, line: number): Promise<void> {
  const targetUri = vscode.Uri.file(filePath);
  const document = await vscode.workspace.openTextDocument(targetUri);
  const editor = await vscode.window.showTextDocument(document);
  const safeLine = Math.max(1, Math.min(line, document.lineCount));
  const position = new vscode.Position(safeLine - 1, 0);
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.AtTop);
}

async function openExternalLink(rawUrl: string, basePath?: string): Promise<void> {
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

function resolveLinkBaseFilePath(basePath?: string): string | undefined {
  if (basePath && path.isAbsolute(basePath)) {
    return basePath;
  }

  const editor = vscode.window.activeTextEditor;
  if (editor?.document.uri.scheme === 'file') {
    return editor.document.uri.fsPath;
  }

  return undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

type ScriptRunResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

type ProjectScriptContext = {
  document: vscode.TextDocument;
  projectDir: string;
  packagePath: string;
};

async function runCommand(
  command: string,
  args: string[],
  cwd: string
): Promise<ScriptRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr
      });
    });
  });
}

function pickToastDetails(result: ScriptRunResult): string {
  const text = `${result.stderr}\n${result.stdout}`.trim();
  if (!text) {
    return '';
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    return '';
  }

  return lines[lines.length - 1];
}

async function resolveProjectScriptContext(requiredScripts: string[]): Promise<ProjectScriptContext | undefined> {
  const document = getActiveMarkdownDocument(true);
  if (!document) {
    return undefined;
  }

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!workspaceFolder) {
    void vscode.window.showWarningMessage('Open this file inside a workspace to run project scripts.');
    return undefined;
  }

  const project = await findNearestProjectConfig(document.uri.fsPath, workspaceFolder.uri.fsPath);
  if (!project) {
    void vscode.window.showWarningMessage('Could not find a project.json for this file.');
    return undefined;
  }

  const packagePath = path.join(project.projectDir, 'package.json');
  let packageRaw: string;
  try {
    packageRaw = await fs.readFile(packagePath, 'utf8');
  } catch {
    void vscode.window.showWarningMessage(`No package.json found in ${project.projectDir}.`);
    return undefined;
  }

  let scripts: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(packageRaw) as unknown;
    const candidateScripts = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>).scripts
      : undefined;
    if (candidateScripts && typeof candidateScripts === 'object' && !Array.isArray(candidateScripts)) {
      scripts = candidateScripts as Record<string, unknown>;
    }
  } catch {
    scripts = {};
  }

  for (const requiredScript of requiredScripts) {
    if (typeof scripts[requiredScript] !== 'string') {
      void vscode.window.showWarningMessage(`Script '${requiredScript}' is not defined in ${packagePath}.`);
      return undefined;
    }
  }

  return {
    document,
    projectDir: project.projectDir,
    packagePath
  };
}

function extractOutputPath(result: ScriptRunResult): string | undefined {
  const text = `${result.stdout}\n${result.stderr}`.trim();
  if (!text) {
    return undefined;
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    const match = line.match(/(?:Build output|Export output):\s*(.+)$/i);
    if (!match) {
      continue;
    }

    const outputPath = match[1].trim();
    if (outputPath) {
      return outputPath;
    }
  }

  return undefined;
}

async function showBuildSuccessToast(result: ScriptRunResult, formatLabel: string): Promise<void> {
  const outputPath = extractOutputPath(result);
  if (!outputPath) {
    void vscode.window.showInformationMessage(`Build succeeded (${formatLabel}).`);
    return;
  }

  const action = await vscode.window.showInformationMessage(
    ['Build succeeded.', `Format: ${formatLabel}`, `Output: ${outputPath}`].join('\n'),
    'Open'
  );

  if (action !== 'Open') {
    return;
  }

  try {
    await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(outputPath));
  } catch (error) {
    void vscode.window.showErrorMessage(`Could not open output file: ${errorToMessage(error)}`);
  }
}

async function runProjectBuildWorkflow(): Promise<void> {
  const context = await resolveProjectScriptContext(['build', 'export']);
  if (!context) {
    return;
  }

  const pickedFormat = await vscode.window.showQuickPick(
    [
      {
        label: 'Markdown (.md)',
        description: 'Build manuscript markdown',
        format: 'md' as const
      },
      {
        label: 'Word (.docx)',
        description: 'Export Word document',
        format: 'docx' as const
      },
      {
        label: 'PDF (.pdf)',
        description: 'Export printable PDF (requires PDF engine)',
        format: 'pdf' as const
      },
      {
        label: 'EPUB (.epub)',
        description: 'Export EPUB ebook',
        format: 'epub' as const
      }
    ],
    {
      title: 'Build',
      placeHolder: 'Select document type'
    }
  );

  if (!pickedFormat) {
    return;
  }

  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const formatLabel = pickedFormat.label;
  const runArgs = pickedFormat.format === 'md'
    ? ['run', 'build']
    : ['run', 'export', '--', '--format', pickedFormat.format];
  let result: ScriptRunResult;
  try {
    result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Build (${formatLabel})`,
        cancellable: false
      },
      async () => runCommand(npmCommand, runArgs, context.projectDir)
    );
  } catch (error) {
    void vscode.window.showErrorMessage(`Build failed: ${errorToMessage(error)}`);
    return;
  }

  if (result.exitCode === 0) {
    await showBuildSuccessToast(result, formatLabel);
    return;
  }

  const details = pickToastDetails(result);
  void vscode.window.showErrorMessage(details
    ? `Build failed: ${details}`
    : `Build failed with exit code ${result.exitCode}.`);
}

function toProjectRelativePath(projectDir: string, filePath: string): string | undefined {
  const normalizedProject = path.resolve(projectDir);
  const normalizedFile = path.resolve(filePath);
  const relative = path.relative(normalizedProject, normalizedFile);

  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return undefined;
  }

  return relative.split(path.sep).join('/');
}

function getStageCheckDetails(stage: string, scope: 'file' | 'project'): string[] {
  const normalizedStage = stage.trim().toLowerCase();
  const target = scope === 'file' ? 'current file' : 'project';
  const details = [
    `Ran stage gate for ${target} (${normalizedStage}).`,
    `Checked minimum status requirement (${normalizedStage}).`
  ];

  switch (normalizedStage) {
    case 'revise':
      details.push('Checked story-bible continuity.');
      break;
    case 'line-edit':
      details.push('Checked story-bible continuity.');
      details.push('Ran spell check.');
      break;
    case 'proof':
    case 'final':
      details.push('Checked story-bible continuity.');
      details.push('Ran markdown lint.');
      details.push('Ran spell check.');
      details.push('Enforced strict local link checks.');
      break;
    case 'draft':
    default:
      break;
  }

  return details;
}

function getLocalValidateDetails(relativeFile: string, stage: string): string[] {
  return [
    `Ran manuscript validation (${relativeFile}).`,
    'Checked metadata and frontmatter.',
    'Checked markdown structure and links.',
    ...getStageCheckDetails(stage, 'file')
  ];
}

async function runLocalValidateWorkflow(): Promise<void> {
  const context = await resolveProjectScriptContext(['validate', 'check-stage']);
  if (!context) {
    return;
  }

  const relativeFile = toProjectRelativePath(context.projectDir, context.document.uri.fsPath);
  if (!relativeFile) {
    void vscode.window.showWarningMessage('Validate requires an active file inside the current project.');
    return;
  }

  let stage: string | undefined;
  try {
    const parsed = parseMarkdownDocument(context.document.getText());
    stage = asString(parsed.frontmatter.status)?.toLowerCase();
  } catch (error) {
    void vscode.window.showErrorMessage(`Validate failed: could not parse frontmatter status (${errorToMessage(error)}).`);
    return;
  }

  if (!stage) {
    void vscode.window.showWarningMessage('Validate requires manuscript metadata status to run stage checks.');
    return;
  }

  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  let validateResult: ScriptRunResult;
  let checkStageResult: ScriptRunResult;

  try {
    const workflowResult = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Validate',
        cancellable: false
      },
      async () => {
        const validate = await runCommand(
          npmCommand,
          ['run', 'validate', '--', '--file', relativeFile],
          context.projectDir
        );
        if (validate.exitCode !== 0) {
          return { validate, checkStage: undefined as ScriptRunResult | undefined };
        }
        const checkStage = await runCommand(
          npmCommand,
          ['run', 'check-stage', '--', '--stage', stage as string, '--file', relativeFile],
          context.projectDir
        );
        return { validate, checkStage };
      }
    );
    validateResult = workflowResult.validate;
    checkStageResult = workflowResult.checkStage ?? {
      exitCode: 1,
      stdout: '',
      stderr: ''
    };
  } catch (error) {
    void vscode.window.showErrorMessage(`Validate failed: ${errorToMessage(error)}`);
    return;
  }

  if (validateResult.exitCode !== 0) {
    const details = pickToastDetails(validateResult);
    void vscode.window.showErrorMessage(details
      ? `Validate failed: ${details}`
      : `Validate failed with exit code ${validateResult.exitCode}.`);
    return;
  }

  if (checkStageResult.exitCode !== 0) {
    const details = pickToastDetails(checkStageResult);
    void vscode.window.showErrorMessage(details
      ? `Validate failed at stage gate (${stage}): ${details}`
      : `Validate failed at stage gate (${stage}) with exit code ${checkStageResult.exitCode}.`);
    return;
  }

  void vscode.window.showInformationMessage([
    'Checks passed.',
    ...getLocalValidateDetails(relativeFile, stage)
  ].join('\n'));
}

async function runProjectGateStageWorkflow(): Promise<void> {
  const context = await resolveProjectScriptContext(['check-stage']);
  if (!context) {
    return;
  }

  const allowedStatuses = await resolveAllowedStatuses(context.document);
  if (allowedStatuses.length === 0) {
    void vscode.window.showWarningMessage('No allowed statuses configured for stage gating.');
    return;
  }

  let currentStatus: string | undefined;
  try {
    const parsed = parseMarkdownDocument(context.document.getText());
    currentStatus = asString(parsed.frontmatter.status)?.toLowerCase();
  } catch {
    currentStatus = undefined;
  }

  const pickedStage = await vscode.window.showQuickPick(
    allowedStatuses.map((status) => ({
      label: status,
      description: currentStatus === status ? 'Current file status' : undefined
    })),
    {
      title: 'Run Stage Checks',
      placeHolder: 'Select stage to enforce across the project'
    }
  );

  if (!pickedStage) {
    return;
  }

  const stage = pickedStage.label;
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  let result: ScriptRunResult;
  try {
    result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Run Stage Checks (${stage})`,
        cancellable: false
      },
      async () => runCommand(
        npmCommand,
        ['run', 'check-stage', '--', '--stage', stage],
        context.projectDir
      )
    );
  } catch (error) {
    void vscode.window.showErrorMessage(`Run Stage Checks failed: ${errorToMessage(error)}`);
    return;
  }

  if (result.exitCode === 0) {
    void vscode.window.showInformationMessage([
      'Checks passed.',
      ...getStageCheckDetails(stage, 'project')
    ].join('\n'));
    return;
  }

  const details = pickToastDetails(result);
  void vscode.window.showErrorMessage(details
    ? `Run Stage Checks failed (${stage}): ${details}`
    : `Run Stage Checks failed (${stage}) with exit code ${result.exitCode}.`);
}

function getActiveMarkdownDocument(showMessage: boolean): vscode.TextDocument | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'markdown') {
    if (showMessage) {
      void vscode.window.showWarningMessage('Open a Markdown file to use Stego metadata tools.');
    }
    return undefined;
  }

  return editor.document;
}

function parseMarkdownDocument(text: string): ParsedMarkdownDocument {
  const lineEnding = text.includes('\r\n') ? '\r\n' : '\n';
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);

  if (!match) {
    return {
      lineEnding,
      hasFrontmatter: false,
      frontmatter: {},
      body: text
    };
  }

  const yamlText = match[1];
  const loaded = yamlText.trim().length > 0
    ? yaml.load(yamlText, { schema: FRONTMATTER_YAML_SCHEMA })
    : {};
  if (loaded === null || loaded === undefined) {
    return {
      lineEnding,
      hasFrontmatter: true,
      frontmatter: {},
      body: text.slice(match[0].length)
    };
  }

  if (typeof loaded !== 'object' || Array.isArray(loaded)) {
    throw new Error('Frontmatter must be a YAML object with key/value pairs.');
  }

  return {
    lineEnding,
    hasFrontmatter: true,
    frontmatter: { ...(loaded as Record<string, unknown>) },
    body: text.slice(match[0].length)
  };
}

function orderFrontmatterStatusFirst(frontmatter: Record<string, unknown>): Record<string, unknown> {
  if (!Object.prototype.hasOwnProperty.call(frontmatter, 'status')) {
    return frontmatter;
  }

  const ordered: Record<string, unknown> = {
    status: frontmatter.status
  };
  for (const [key, value] of Object.entries(frontmatter)) {
    if (key === 'status') {
      continue;
    }
    ordered[key] = value;
  }

  return ordered;
}

function serializeMarkdownDocument(parsed: ParsedMarkdownDocument): string {
  const includeFrontmatter = parsed.hasFrontmatter || Object.keys(parsed.frontmatter).length > 0;
  const normalizedBody = parsed.body.replace(/^\r?\n*/, '');

  if (!includeFrontmatter) {
    return parsed.body;
  }

  const orderedFrontmatter = orderFrontmatterStatusFirst(parsed.frontmatter);
  const yamlBody = yaml.dump(orderedFrontmatter, { lineWidth: -1, noRefs: true }).trimEnd();
  const frontmatterBlock = yamlBody.length > 0
    ? `---${parsed.lineEnding}${yamlBody}${parsed.lineEnding}---`
    : `---${parsed.lineEnding}---`;

  if (!normalizedBody) {
    return `${frontmatterBlock}${parsed.lineEnding}`;
  }

  return `${frontmatterBlock}${parsed.lineEnding}${parsed.lineEnding}${normalizedBody}`;
}

async function writeParsedDocument(document: vscode.TextDocument, parsed: ParsedMarkdownDocument): Promise<boolean> {
  const nextText = serializeMarkdownDocument(parsed);
  const changed = await replaceDocumentText(document, nextText);
  if (!changed) {
    return false;
  }

  try {
    await document.save();
  } catch (error) {
    void vscode.window.showErrorMessage(`Could not auto-save metadata changes: ${errorToMessage(error)}`);
  }

  return true;
}

async function replaceDocumentText(document: vscode.TextDocument, nextText: string): Promise<boolean> {
  const currentText = document.getText();
  if (currentText === nextText) {
    return false;
  }

  const end = document.positionAt(currentText.length);
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, new vscode.Range(new vscode.Position(0, 0), end), nextText);
  return vscode.workspace.applyEdit(edit);
}

async function promptAndAddMetadataField(): Promise<void> {
  const document = getActiveMarkdownDocument(true);
  if (!document) {
    return;
  }

  const key = (await vscode.window.showInputBox({
    prompt: 'Metadata key (top-level frontmatter key)',
    placeHolder: 'example: title'
  }))?.trim();

  if (!key) {
    return;
  }

  if (!isValidMetadataKey(key)) {
    void vscode.window.showWarningMessage('Metadata key must match /^[A-Za-z0-9_-]+$/.');
    return;
  }

  let parsed: ParsedMarkdownDocument;
  try {
    parsed = parseMarkdownDocument(document.getText());
  } catch (error) {
    void vscode.window.showErrorMessage(`Could not parse frontmatter: ${errorToMessage(error)}`);
    return;
  }

  const valueInput = await vscode.window.showInputBox({
    prompt: `Value for '${key}' (YAML syntax supported)`,
    placeHolder: 'example: Draft 2'
  });

  if (valueInput === undefined) {
    return;
  }

  parsed.frontmatter[key] = parseMetadataInput(valueInput);
  await writeParsedDocument(document, parsed);
}

async function promptAndEditMetadataField(key: string): Promise<void> {
  const document = getActiveMarkdownDocument(true);
  if (!document) {
    return;
  }

  let parsed: ParsedMarkdownDocument;
  try {
    parsed = parseMarkdownDocument(document.getText());
  } catch (error) {
    void vscode.window.showErrorMessage(`Could not parse frontmatter: ${errorToMessage(error)}`);
    return;
  }

  if (!(key in parsed.frontmatter)) {
    return;
  }

  const current = parsed.frontmatter[key];
  const edited = await vscode.window.showInputBox({
    prompt: `New value for '${key}' (YAML syntax supported)`,
    value: formatMetadataValue(current)
  });

  if (edited === undefined) {
    return;
  }

  parsed.frontmatter[key] = parseMetadataInput(edited);
  await writeParsedDocument(document, parsed);
}

async function setMetadataStatus(value: string): Promise<void> {
  const document = getActiveMarkdownDocument(true);
  if (!document) {
    return;
  }

  let parsed: ParsedMarkdownDocument;
  try {
    parsed = parseMarkdownDocument(document.getText());
  } catch (error) {
    void vscode.window.showErrorMessage(`Could not parse frontmatter: ${errorToMessage(error)}`);
    return;
  }

  parsed.frontmatter.status = value.trim().toLowerCase();
  await writeParsedDocument(document, parsed);
}

async function promptAndAddMetadataArrayItem(key: string): Promise<void> {
  const document = getActiveMarkdownDocument(true);
  if (!document) {
    return;
  }

  let parsed: ParsedMarkdownDocument;
  try {
    parsed = parseMarkdownDocument(document.getText());
  } catch (error) {
    void vscode.window.showErrorMessage(`Could not parse frontmatter: ${errorToMessage(error)}`);
    return;
  }

  const current = parsed.frontmatter[key];
  if (!Array.isArray(current)) {
    void vscode.window.showWarningMessage(`'${key}' is not an array field.`);
    return;
  }

  const valueInput = await vscode.window.showInputBox({
    prompt: `Add item to '${key}' (YAML syntax supported)`,
    placeHolder: 'example: LOC-ASDF'
  });

  if (valueInput === undefined) {
    return;
  }

  current.push(parseMetadataInput(valueInput));
  parsed.frontmatter[key] = current;
  await writeParsedDocument(document, parsed);
}

async function promptAndEditMetadataArrayItem(key: string, index: number): Promise<void> {
  const document = getActiveMarkdownDocument(true);
  if (!document) {
    return;
  }

  let parsed: ParsedMarkdownDocument;
  try {
    parsed = parseMarkdownDocument(document.getText());
  } catch (error) {
    void vscode.window.showErrorMessage(`Could not parse frontmatter: ${errorToMessage(error)}`);
    return;
  }

  const current = parsed.frontmatter[key];
  if (!Array.isArray(current)) {
    void vscode.window.showWarningMessage(`'${key}' is not an array field.`);
    return;
  }

  if (index < 0 || index >= current.length) {
    return;
  }

  const edited = await vscode.window.showInputBox({
    prompt: `Edit item ${index + 1} in '${key}' (YAML syntax supported)`,
    value: formatMetadataValue(current[index])
  });

  if (edited === undefined) {
    return;
  }

  current[index] = parseMetadataInput(edited);
  parsed.frontmatter[key] = current;
  await writeParsedDocument(document, parsed);
}

async function removeMetadataField(key: string): Promise<void> {
  const document = getActiveMarkdownDocument(true);
  if (!document) {
    return;
  }

  let parsed: ParsedMarkdownDocument;
  try {
    parsed = parseMarkdownDocument(document.getText());
  } catch (error) {
    void vscode.window.showErrorMessage(`Could not parse frontmatter: ${errorToMessage(error)}`);
    return;
  }

  if (!(key in parsed.frontmatter)) {
    return;
  }

  if (Array.isArray(parsed.frontmatter[key])) {
    void vscode.window.showWarningMessage(`Delete array items in '${key}' to remove this field.`);
    return;
  }

  delete parsed.frontmatter[key];
  await writeParsedDocument(document, parsed);
}

async function removeMetadataArrayItem(key: string, index: number): Promise<void> {
  const document = getActiveMarkdownDocument(true);
  if (!document) {
    return;
  }

  let parsed: ParsedMarkdownDocument;
  try {
    parsed = parseMarkdownDocument(document.getText());
  } catch (error) {
    void vscode.window.showErrorMessage(`Could not parse frontmatter: ${errorToMessage(error)}`);
    return;
  }

  const current = parsed.frontmatter[key];
  if (!Array.isArray(current)) {
    void vscode.window.showWarningMessage(`'${key}' is not an array field.`);
    return;
  }

  if (index < 0 || index >= current.length) {
    return;
  }

  current.splice(index, 1);
  if (current.length === 0) {
    delete parsed.frontmatter[key];
  } else {
    parsed.frontmatter[key] = current;
  }

  await writeParsedDocument(document, parsed);
}

function parseMetadataInput(value: string): unknown {
  if (!value.trim()) {
    return '';
  }

  const loaded = yaml.load(value, { schema: FRONTMATTER_YAML_SCHEMA });
  return loaded === undefined ? value : loaded;
}

function formatMetadataValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  const dumped = yaml.dump(value, { lineWidth: -1, noRefs: true }).trim();
  return dumped || String(value);
}

function isValidMetadataKey(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

function getFrontmatterLineRange(document: vscode.TextDocument): FrontmatterLineRange | undefined {
  if (document.lineCount < 2) {
    return undefined;
  }

  if (document.lineAt(0).text.trim() !== '---') {
    return undefined;
  }

  for (let line = 1; line < document.lineCount; line += 1) {
    if (document.lineAt(line).text.trim() === '---') {
      return { start: 0, end: line };
    }
  }

  return undefined;
}

async function maybeAutoFoldFrontmatter(editor: vscode.TextEditor | undefined): Promise<void> {
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

async function toggleFrontmatterFold(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'markdown') {
    void vscode.window.showWarningMessage('Open a Markdown file to fold frontmatter.');
    return;
  }

  const range = getFrontmatterLineRange(editor.document);
  if (!range) {
    void vscode.window.showInformationMessage('No YAML frontmatter found at the top of this file.');
    return;
  }

  await vscode.commands.executeCommand('editor.toggleFold', {
    selectionLines: [range.start]
  });
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function errorToMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
}

function renderMarkdownForExplorer(rawText: string, basePath?: string): string {
  const rendered = EXPLORER_MARKDOWN_RENDERER.render(rawText);
  const basePathAttr = basePath ? ` data-base-path="${escapeAttribute(basePath)}"` : '';
  return `<div class="md-rendered"${basePathAttr}>${rendered}</div>`;
}

function toTitleWord(value: string): string {
  if (!value) {
    return value;
  }

  return `${value.slice(0, 1).toUpperCase()}${value.slice(1).toLowerCase()}`;
}

function formatTitleWords(words: string[]): string {
  const minorWords = new Set([
    'a',
    'an',
    'the',
    'and',
    'but',
    'or',
    'nor',
    'for',
    'so',
    'yet',
    'as',
    'at',
    'by',
    'in',
    'of',
    'on',
    'per',
    'to',
    'via'
  ]);

  return words.map((word, index) => {
    const lower = word.toLowerCase();
    const isEdge = index === 0 || index === words.length - 1;
    if (!isEdge && minorWords.has(lower)) {
      return lower;
    }
    return toTitleWord(word);
  }).join(' ');
}

function getSidebarFileTitle(documentPath: string): { title: string; filename: string } {
  const filename = path.basename(documentPath || '');
  if (!filename) {
    return { title: '', filename: '' };
  }

  const extensionIndex = filename.lastIndexOf('.');
  const stem = extensionIndex > 0 ? filename.slice(0, extensionIndex) : filename;
  const match = stem.match(/^\d+-([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)$/);
  if (!match) {
    return { title: filename, filename };
  }

  const words = match[1]
    .split('-')
    .filter((word) => word.length > 0);
  if (words.length === 0) {
    return { title: filename, filename };
  }

  return {
    title: formatTitleWords(words),
    filename
  };
}

function renderSidebarHtml(webview: vscode.Webview, state: SidebarState): string {
  const nonce = randomNonce();
  const fileTitle = getSidebarFileTitle(state.documentPath);
  const showMetadataEditingControls = state.mode === 'manuscript' && state.metadataEditing;
  const renderReferenceCards = (references: SidebarIdentifierLink[]): string => {
    if (references.length === 0) {
      return '';
    }

    return `<div class="meta-reference-list">`
      + references.map((reference) => {
        const status = reference.known
          ? ''
          : '<span class="badge warn">Missing</span>';
        const showTitle = reference.title.trim().length > 0
          && reference.title.trim().toUpperCase() !== reference.id.toUpperCase();
        const title = showTitle ? `<span class="item-title-text">${escapeHtml(reference.title)}</span>` : '';
        const refLabel = `<button class="id-link" data-action="openIdentifier" data-id="${escapeAttribute(reference.id)}">${escapeHtml(reference.id)}</button>`;
        const description = reference.description
          ? `<div class="item-subtext">${escapeHtml(reference.description)}</div>`
          : '';

        return `<div class="meta-reference">`
          + `<div class="item-title-row">${refLabel}${title}${status}</div>`
          + `${description}`
          + `</div>`;
      }).join('')
      + `</div>`;
  };

  const metadataHtml = state.metadataEntries.length > 0
    ? state.metadataEntries.map((entry) => {
      if (entry.isArray) {
        const arrayItems = entry.arrayItems.length > 0
          ? `<div class="array-list">`
            + entry.arrayItems.map((item) => `<div class="array-item">`
              + `<div class="item-main">`
              + `<div class="item-subtext metadata-value">${escapeHtml(item.valueText)}</div>`
              + `${renderReferenceCards(item.references)}`
              + `</div>`
              + `${showMetadataEditingControls
                ? `<div class="item-actions">`
                  + `<button class="btn subtle" data-action="editMetadataArrayItem" data-key="${escapeAttribute(entry.key)}" data-index="${item.index}">Edit</button>`
                  + `<button class="btn danger" data-action="removeMetadataArrayItem" data-key="${escapeAttribute(entry.key)}" data-index="${item.index}">Remove</button>`
                  + `</div>`
                : ''}`
              + `</div>`).join('')
            + `</div>`
          : '<div class="empty tiny">No items in this array.</div>';

        return `<article class="item metadata-item metadata-array-field">`
          + `<div class="item-main">`
          + `<div class="item-title-row"><code>${escapeHtml(entry.key)}</code>${entry.isBibleCategory ? '<span class="badge bible">Story Bible</span>' : ''}<span class="badge">${entry.arrayItems.length} items</span></div>`
          + `${arrayItems}`
          + `${showMetadataEditingControls
            ? `<div class="array-field-actions">`
              + `<button class="btn subtle" data-action="addMetadataArrayItem" data-key="${escapeAttribute(entry.key)}">Add Item</button>`
              + `</div>`
            : ''}`
          + `</div>`
          + `</article>`;
      }

      return `<article class="item metadata-item">`
        + `<div class="item-main">`
        + `<div class="item-title-row"><code>${escapeHtml(entry.key)}</code>${entry.isBibleCategory ? '<span class="badge bible">Story Bible</span>' : ''}</div>`
        + `<div class="item-subtext metadata-value">${escapeHtml(entry.valueText)}</div>`
        + `${renderReferenceCards(entry.references)}`
        + `</div>`
        + `${showMetadataEditingControls
          ? `<div class="item-actions">`
            + `<button class="btn subtle" data-action="editMetadataField" data-key="${escapeAttribute(entry.key)}">Edit</button>`
            + `<button class="btn danger" data-action="removeMetadataField" data-key="${escapeAttribute(entry.key)}">Remove</button>`
            + `</div>`
          : ''}`
        + `</article>`;
    }).join('')
    : '<div class="empty">No metadata fields yet.</div>';

  const activeStageLabel = state.statusControl?.value ?? state.statusControl?.invalidValue;
  const runLocalChecksLabel = activeStageLabel
    ? `Run ${activeStageLabel} checks.`
    : 'Run stage checks.';

  const statusControlHtml = state.mode === 'manuscript' && state.statusControl
    ? `<div class="status-editor">`
      + `<div class="status-options">`
      + state.statusControl.options.map((option) => {
        const checked = state.statusControl?.value === option ? ' checked' : '';
        return `<label class="status-option">`
          + `<input class="status-radio" type="radio" name="metadata-status" value="${escapeAttribute(option)}" data-action="setMetadataStatus"${checked} />`
          + `<span>${escapeHtml(option)}</span>`
          + `</label>`;
      }).join('')
      + `</div>`
      + `<div class="status-actions"><button class="btn subtle inline-toggle" data-action="runLocalValidate">${escapeHtml(runLocalChecksLabel)}</button></div>`
      + `${state.statusControl.invalidValue
        ? `<div class="status-note warn">Unknown current status: <code>${escapeHtml(state.statusControl.invalidValue)}</code></div>`
        : !state.statusControl.value
          ? '<div class="status-note">No status set yet.</div>'
          : ''}`
      + `</div>`
    : '';
  const statusPanel = state.mode === 'manuscript' && statusControlHtml
    ? `<section class="panel">`
      + `<h2>Status</h2>`
      + `${statusControlHtml}`
      + `</section>`
    : '';

  const navIcon = (pathData: string): string => (
    `<svg class="nav-icon" viewBox="0 0 16 16" aria-hidden="true">`
    + `<path d="${pathData}"></path>`
    + `</svg>`
  );
  const backIcon = navIcon('M9.5 3L4.5 8l5 5 1.1-1.1L6.7 8l3.9-3.9z');
  const forwardIcon = navIcon('M6.5 3L5.4 4.1 9.3 8l-3.9 3.9L6.5 13l5-5z');
  const homeIcon = navIcon('M8 2l6 5v7h-4V9H6v5H2V7z');
  const previewIcon = navIcon('M13.5 1H4.5C3.122 1 2 2.122 2 3.5V6.276C2.319 6.162 2.653 6.089 3 6.05V3.499C3 2.672 3.673 1.999 4.5 1.999H8.5V13.385L9.557 14.442C9.714 14.591 9.831 14.786 9.907 14.999H13.5C14.878 14.999 16 13.877 16 12.499V3.5C16 2.122 14.878 1 13.5 1ZM15 12.5C15 13.327 14.327 14 13.5 14H9.5V2H13.5C14.327 2 15 2.673 15 3.5V12.5ZM6.29 12.59C6.74 12.01 7 11.28 7 10.5C7 8.57 5.43 7 3.5 7C1.57 7 0 8.57 0 10.5C0 12.43 1.57 14 3.5 14C4.28 14 5.01 13.74 5.59 13.29L8.15 15.85C8.24 15.95 8.37 16 8.5 16C8.63 16 8.76 15.95 8.85 15.85C9.05 15.66 9.05 15.34 8.85 15.15L6.29 12.59ZM5.5 12C5.36 12.19 5.19 12.36 5 12.5C4.59 12.81 4.06 13 3.5 13C2.12 13 1 11.88 1 10.5C1 9.12 2.12 8 3.5 8C4.88 8 6 9.12 6 10.5C6 11.06 5.81 11.59 5.5 12Z');
  const collapsePanelIcon = navIcon('M3.4 5.4L8 10l4.6-4.6 1 1L8 12 2.4 6.4z');
  const expandPanelIcon = navIcon('M10.6 3.4L6 8l4.6 4.6-1 1L4 8l5.6-5.6z');

  const explorerNav = `<div class="explorer-nav">`
    + `<button class="btn subtle btn-icon" data-action="explorerBack"${state.explorerCanGoBack ? '' : ' disabled'} aria-label="Back" title="Back">${backIcon}</button>`
    + `<button class="btn subtle btn-icon" data-action="explorerForward"${state.explorerCanGoForward ? '' : ' disabled'} aria-label="Forward" title="Forward">${forwardIcon}</button>`
    + `<button class="btn subtle btn-icon" data-action="explorerHome"${state.explorerCanGoHome ? '' : ' disabled'} aria-label="Home" title="Home">${homeIcon}</button>`
    + `<button class="btn subtle btn-icon" data-action="toggleExplorerCollapse" aria-label="${state.explorerCollapsed ? 'Expand' : 'Collapse'}" title="${state.explorerCollapsed ? 'Expand' : 'Collapse'}">${state.explorerCollapsed ? expandPanelIcon : collapsePanelIcon}</button>`
    + `</div>`;

  const explorerBreadcrumbs = !state.explorer || state.explorerCollapsed
    ? ''
    : state.explorer.kind === 'home'
      ? `<div class="explorer-breadcrumbs"><span class="explorer-crumb-current">Home</span></div>`
      : state.explorer.kind === 'category'
        ? `<div class="explorer-breadcrumbs">`
          + `<button class="explorer-crumb-link" data-action="explorerHome">Home</button>`
          + `<span class="explorer-crumb-separator">/</span>`
          + `<span class="explorer-crumb-current">${escapeHtml(state.explorer.category.label)}</span>`
          + `</div>`
        : `<div class="explorer-breadcrumbs">`
          + `<button class="explorer-crumb-link" data-action="explorerHome">Home</button>`
          + `<span class="explorer-crumb-separator">/</span>`
          + `${state.explorer.category
            ? `<button class="explorer-crumb-link" data-action="openExplorerCategory" data-key="${escapeAttribute(state.explorer.category.key)}" data-prefix="${escapeAttribute(state.explorer.category.prefix)}">${escapeHtml(state.explorer.category.label)}</button>`
              + `<span class="explorer-crumb-separator">/</span>`
            : ''}`
          + `<span class="explorer-crumb-current">${escapeHtml(state.explorer.entry.id)}</span>`
          + `</div>`;

  const explorerBody = !state.explorer
    ? `<div class="empty">Click an identifier to inspect it here.</div>`
    : state.explorerCollapsed
      ? ''
      : state.explorer.kind === 'home'
        ? (state.explorer.categories.length > 0
          ? `<div class="explorer-list">`
            + state.explorer.categories.map((category) => `<div class="explorer-list-row">`
              + `<button class="id-link" data-action="openExplorerCategory" data-key="${escapeAttribute(category.key)}" data-prefix="${escapeAttribute(category.prefix)}">${escapeHtml(category.label)}</button>`
              + `<span class="badge">${category.count}</span>`
              + `</div>`).join('')
            + `</div>`
          : '<div class="empty">No bible categories found in this project.</div>')
        : state.explorer.kind === 'category'
          ? `<article class="item metadata-item">`
            + `<div class="item-main">`
            + `<div class="item-title-row"><span class="item-title-text">${escapeHtml(state.explorer.category.label)}</span><span class="badge">${state.explorer.items.length}</span></div>`
            + `${state.explorer.items.length > 0
              ? `<div class="explorer-list">`
                + state.explorer.items.map((item) => `<div class="explorer-list-row">`
                  + `<button class="id-link" data-action="openIdentifier" data-id="${escapeAttribute(item.id)}">${escapeHtml(item.id)}</button>`
                  + `${item.title.trim().toUpperCase() !== item.id.toUpperCase() ? `<span class="item-subtext">${escapeHtml(item.title)}</span>` : ''}`
                  + `${!item.known ? '<span class="badge warn">Missing</span>' : ''}`
                  + `${item.description ? `<div class="item-subtext">${escapeHtml(item.description)}</div>` : ''}`
                  + `</div>`).join('')
                + `</div>`
              : '<div class="empty tiny">No identifiers found for this category.</div>'}`
            + `</div>`
            + `</article>`
          : (() => {
            const entry = state.explorer.entry;
            return `<article class="item metadata-item">`
              + `<div class="item-main">`
              + `<div class="item-title-row">`
              + `<span class="item-title-text">${escapeHtml(entry.title)}</span>`
              + `${!entry.known ? '<span class="badge warn">Missing</span>' : ''}`
              + `</div>`
              + `${entry.description
                ? `<div class="metadata-value">${renderMarkdownForExplorer(entry.description, entry.sourceFilePath ?? state.documentPath)}</div>`
                : ''}`
              + `${entry.sourceFilePath && entry.sourceLine
                ? `<div class="explorer-source-row">`
                  + `<span class="tiny-label">Source</span>`
                  + `<button class="backlink-link" data-action="openBacklink" data-file-path="${escapeAttribute(entry.sourceFilePath)}" data-line="${entry.sourceLine}">${escapeHtml(entry.sourceFileLabel ?? entry.sourceFilePath)}:${entry.sourceLine}</button>`
                  + `</div>`
                : ''}`
              + `${entry.sourceBody
                ? `<div class="explorer-body">${renderMarkdownForExplorer(entry.sourceBody, entry.sourceFilePath)}</div>`
                : ''}`
              + `<div class="backlink-section">`
              + `<div class="item-title-row">`
              + `<button class="btn subtle inline-toggle" data-action="toggleExplorerBacklinks">${entry.backlinks.length} references${entry.backlinksExpanded ? ' (hide)' : ''}</button>`
              + `</div>`
              + `${entry.backlinksExpanded
                ? `<div class="filter-row filter-row-tight"><input id="backlink-filter" class="filter-input" type="text" value="${escapeAttribute(state.backlinkFilter)}" placeholder="Filter references by filename" /></div>`
                : ''}`
              + `${entry.backlinksExpanded
                ? (entry.backlinks.length > 0
                  ? entry.backlinks.map((backlink) => `<div class="backlink-row">`
                    + `<button class="backlink-link" data-action="openBacklink" data-file-path="${escapeAttribute(backlink.filePath)}" data-line="${backlink.line}">${escapeHtml(backlink.fileLabel)}</button>`
                    + `<span class="badge">${backlink.count}x</span>`
                    + `<div class="item-subtext">${escapeHtml(backlink.excerpt)}</div>`
                    + `</div>`).join('')
                  : '<div class="empty tiny">No references found.</div>')
                : ''}`
              + `</div>`
              + `</div>`
              + `</article>`;
          })();

  const explorerHtml = `<section class="panel explorer-panel${state.explorerCollapsed ? ' collapsed' : ''}">`
    + `<div class="panel-heading">`
    + `<h2>Bible Browser</h2>`
    + `${explorerNav}`
    + `</div>`
    + `${explorerBreadcrumbs}`
    + `${explorerBody}`
    + `</section>`;

  const tocHtml = state.tocEntries.length > 0
    ? state.tocEntries.map((entry) => {
      const headingLink = `<button class="toc-link lvl-${entry.level}" data-action="openTocHeading" data-line="${entry.line}">${escapeHtml(entry.heading)}</button>`;
      const backlinkSection = entry.identifier
        ? `<div class="backlink-section">`
          + `<div class="item-title-row">`
          + `<button class="btn subtle inline-toggle" data-action="toggleTocBacklinks" data-id="${escapeAttribute(entry.identifier.id)}">${entry.backlinkCount} references${entry.backlinksExpanded ? ' (hide)' : ''}</button>`
          + `</div>`
          + `${entry.backlinksExpanded
            ? (entry.backlinks.length > 0
              ? entry.backlinks.map((backlink) => `<div class="backlink-row">`
                + `<button class="backlink-link" data-action="openBacklink" data-file-path="${escapeAttribute(backlink.filePath)}" data-line="${backlink.line}">${escapeHtml(backlink.fileLabel)}</button>`
                + `<span class="badge">${backlink.count}x</span>`
                + `<div class="item-subtext">${escapeHtml(backlink.excerpt)}</div>`
                + `</div>`).join('')
              : '<div class="empty tiny">No matches for this identifier.</div>')
            : ''}`
          + `</div>`
        : '';

      return `<article class="toc-item">${headingLink}${backlinkSection}</article>`;
    }).join('')
    : '<div class="empty">No headings found (H1-H3).</div>';

  const tocPanel = state.showToc
    ? `<section class="panel">`
      + `<div class="panel-heading">`
      + `<h2>Table Of Contents</h2>`
      + `${state.mode
        ? `<span class="panel-kind-badge">${
          state.mode === 'manuscript'
            ? 'Manuscript'
            : state.isBibleCategoryFile
              ? 'Bible Entry'
              : 'Note'
        }</span>`
        : ''}`
      + `</div>`
      + `${state.isBibleCategoryFile && (!state.explorer || state.explorer.kind !== 'identifier' || state.explorerCollapsed)
        ? `<div class="filter-row"><input id="backlink-filter" class="filter-input" type="text" value="${escapeAttribute(state.backlinkFilter)}" placeholder="Filter references by filename" /></div>`
        : ''}`
      + `<div class="toc-list">${tocHtml}</div>`
      + `</section>`
    : '';

  const metadataPanel = state.mode === 'manuscript'
    ? `<section class="panel">`
      + `<div class="panel-heading">`
      + `<h2>Metadata</h2>`
      + `<button class="btn subtle" data-action="toggleMetadataEditing">${state.metadataEditing ? 'Done' : 'Edit'}</button>`
      + `</div>`
      + `${showMetadataEditingControls ? '<div class="actions"><button class="btn primary" data-action="addMetadataField">Add Field</button></div>' : ''}`
      + `<div class="list">${metadataHtml}</div>`
      + `</section>`
    : '';

  const utilityPanel = state.mode === 'manuscript'
    ? ''
    : `<section class="panel">`
      + `<h2>Actions</h2>`
      + `<div class="actions"><button class="btn subtle" data-action="refresh">Refresh</button></div>`
      + `</section>`;

  const content = !state.hasActiveMarkdown
    ? '<div class="empty-panel">Open a Markdown document to use the Stego sidebar.</div>'
    : `
      <div class="file-title-row">
        <div class="file-title" title="${escapeAttribute(fileTitle.filename)}">${escapeHtml(fileTitle.title)}</div>
        <button class="btn subtle btn-icon file-preview-btn" data-action="openMarkdownPreview" aria-label="Open Markdown Preview" title="Open Markdown Preview">${previewIcon}</button>
      </div>
      ${state.parseError ? `<div class="error-panel">Frontmatter parse error: ${escapeHtml(state.parseError)}</div>` : ''}
      ${statusPanel}
      ${state.showExplorer ? explorerHtml : ''}
      ${state.mode === 'manuscript' ? metadataPanel : tocPanel}
      ${state.mode === 'manuscript' ? tocPanel : ''}
      ${utilityPanel}
    `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body {
      margin: 0;
      padding: 12px;
      font-family: var(--vscode-font-family);
      font-size: 12px;
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
    }
    * { box-sizing: border-box; }
    .panel {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 10px;
      padding: 10px;
      margin-bottom: 12px;
      background: var(--vscode-editorWidget-background);
    }
    h2 {
      margin: 0 0 8px;
      font-size: 11px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
    }
    .panel-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
    }
    .panel-heading h2 {
      margin: 0;
    }
    .panel-kind-badge {
      display: inline-flex;
      align-items: center;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 999px;
      padding: 1px 7px;
      font-size: 10px;
      letter-spacing: 0.02em;
      color: var(--vscode-descriptionForeground);
      background: color-mix(in srgb, var(--vscode-editorWidget-background) 82%, var(--vscode-input-background));
      white-space: nowrap;
    }
    .explorer-nav {
      display: inline-flex;
      gap: 6px;
      align-items: center;
    }
    .explorer-breadcrumbs {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      margin: 0 0 8px;
      font-size: 11px;
      line-height: 1.3;
    }
    .explorer-crumb-link {
      border: 0;
      background: transparent;
      padding: 0;
      color: var(--vscode-textLink-foreground);
      text-decoration: underline;
      cursor: pointer;
      font: inherit;
      font-size: inherit;
    }
    .explorer-crumb-link:hover {
      color: var(--vscode-textLink-activeForeground);
    }
    .explorer-crumb-separator {
      color: var(--vscode-descriptionForeground);
    }
    .explorer-crumb-current {
      color: var(--vscode-foreground);
      font-weight: 600;
    }
    .explorer-panel.collapsed {
      padding-bottom: 10px;
    }
    .explorer-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .explorer-list-row {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      background: var(--vscode-input-background);
      padding: 6px 8px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
    }
    .explorer-list-row .item-subtext {
      width: 100%;
    }
    .btn.btn-icon {
      width: 26px;
      height: 24px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .btn.btn-icon .nav-icon {
      width: 14px;
      height: 14px;
      fill: currentColor;
    }
    .btn:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .file-title-row {
      margin-bottom: 12px;
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }
    .file-title {
      margin: 0;
      flex: 1;
      font-size: 16px;
      font-weight: 700;
      line-height: 1.25;
      color: var(--vscode-foreground);
      word-break: break-word;
    }
    .file-preview-btn {
      flex: 0 0 auto;
    }
    .list,
    .toc-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .item {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      padding: 8px;
      background: var(--vscode-input-background);
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
    }
    .metadata-item {
      padding: 10px;
      gap: 10px;
    }
    .item-main {
      min-width: 0;
      flex: 1;
      overflow-wrap: anywhere;
    }
    .item-title-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      margin-bottom: 4px;
    }
    .item-title-text {
      font-weight: 600;
      color: var(--vscode-foreground);
    }
    .item-subtext {
      color: var(--vscode-descriptionForeground);
      line-height: 1.35;
      white-space: pre-wrap;
    }
    .metadata-value {
      font-size: 13px;
      line-height: 1.45;
    }
    .meta-reference-list {
      margin-top: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .meta-reference {
      border: 1px dashed var(--vscode-panel-border);
      border-radius: 6px;
      padding: 6px;
      background: color-mix(in srgb, var(--vscode-input-background) 75%, var(--vscode-editorWidget-background));
    }
    .array-list {
      margin-top: 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .array-item {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      padding: 8px;
      background: color-mix(in srgb, var(--vscode-input-background) 80%, var(--vscode-editorWidget-background));
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
    }
    .metadata-array-field .item-main {
      width: 100%;
    }
    .array-field-actions {
      margin-top: 8px;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .item-actions {
      display: inline-flex;
      gap: 6px;
      flex-shrink: 0;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 8px;
    }
    .status-editor {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      padding: 8px;
      margin-bottom: 10px;
      background: var(--vscode-input-background);
    }
    .status-options {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 10px;
    }
    .status-option {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      padding: 2px 0;
    }
    .status-radio {
      margin: 0;
    }
    .status-actions {
      margin-top: 8px;
      display: flex;
      justify-content: flex-end;
    }
    .status-note {
      margin-top: 6px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }
    .status-note.warn {
      color: var(--vscode-editorWarning-foreground);
    }
    .toc-item {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      padding: 8px;
      background: var(--vscode-input-background);
    }
    .toc-link {
      border: 0;
      background: transparent;
      color: var(--vscode-textLink-foreground);
      text-decoration: underline;
      padding: 0;
      font: inherit;
      text-align: left;
      cursor: pointer;
      width: 100%;
      line-height: 1.35;
    }
    .toc-link.lvl-2 { padding-left: 10px; }
    .toc-link.lvl-3 { padding-left: 20px; }
    .backlink-section {
      margin-top: 8px;
      border-top: 1px solid var(--vscode-panel-border);
      padding-top: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .explorer-source-row {
      margin-top: 8px;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
    }
    .explorer-body {
      margin: 8px 0 0;
      padding: 8px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      background: var(--vscode-textCodeBlock-background);
      color: var(--vscode-foreground);
      white-space: normal;
      word-break: break-word;
      font: inherit;
      line-height: 1.4;
    }
    .md-rendered {
      color: var(--vscode-descriptionForeground);
      line-height: 1.45;
      overflow-wrap: anywhere;
    }
    .md-rendered p,
    .md-rendered ul,
    .md-rendered ol,
    .md-rendered blockquote,
    .md-rendered pre,
    .md-rendered table,
    .md-rendered h1,
    .md-rendered h2,
    .md-rendered h3,
    .md-rendered h4,
    .md-rendered h5,
    .md-rendered h6 {
      margin: 0 0 8px;
    }
    .md-rendered p:last-child,
    .md-rendered ul:last-child,
    .md-rendered ol:last-child,
    .md-rendered blockquote:last-child,
    .md-rendered pre:last-child,
    .md-rendered table:last-child,
    .md-rendered h1:last-child,
    .md-rendered h2:last-child,
    .md-rendered h3:last-child,
    .md-rendered h4:last-child,
    .md-rendered h5:last-child,
    .md-rendered h6:last-child {
      margin-bottom: 0;
    }
    .md-rendered ul,
    .md-rendered ol {
      padding-left: 18px;
      margin-top: 0;
      margin-bottom: 4px;
    }
    .md-rendered li {
      margin: 0 !important;
      padding: 1px 0;
      line-height: 1.35;
    }
    .md-rendered li + li {
      margin-top: 4px !important;
    }
    .md-rendered li > p {
      margin: 0 !important;
      display: inline;
    }
    .md-rendered blockquote {
      margin-left: 0;
      padding-left: 10px;
      border-left: 2px solid var(--vscode-panel-border);
    }
    .md-rendered pre {
      padding: 8px;
      border-radius: 6px;
      border: 1px solid var(--vscode-panel-border);
      background: var(--vscode-textCodeBlock-background);
      overflow-x: auto;
    }
    .md-rendered code {
      white-space: pre-wrap;
    }
    .md-rendered table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .md-rendered th,
    .md-rendered td {
      border: 1px solid var(--vscode-panel-border);
      padding: 4px 6px;
      text-align: left;
      vertical-align: top;
    }
    .md-rendered a {
      color: var(--vscode-textLink-foreground);
      text-decoration: underline;
      cursor: pointer;
    }
    .md-rendered a:hover {
      color: var(--vscode-textLink-activeForeground);
    }
    .md-rendered a:focus-visible {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 1px;
    }
    .md-id-link {
      display: inline;
      vertical-align: baseline;
    }
    .tiny-label {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .backlink-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 4px 8px;
      align-items: center;
    }
    .backlink-link {
      border: 0;
      background: transparent;
      color: var(--vscode-textLink-foreground);
      text-decoration: underline;
      padding: 0;
      text-align: left;
      font: inherit;
      cursor: pointer;
    }
    .filter-row {
      margin-bottom: 8px;
    }
    .filter-row.filter-row-tight {
      margin: 0;
    }
    .filter-input {
      width: 100%;
      border: 1px solid var(--vscode-input-border);
      border-radius: 6px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      padding: 6px 8px;
      font: inherit;
    }
    code {
      padding: 1px 4px;
      border-radius: 4px;
      background: var(--vscode-textCodeBlock-background);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 1px 6px;
      border-radius: 999px;
      font-size: 10px;
      letter-spacing: 0.02em;
      border: 1px solid var(--vscode-panel-border);
    }
    .badge.bible {
      background: var(--vscode-button-background);
      border-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      font-weight: 700;
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }
    .badge.warn { color: var(--vscode-editorWarning-foreground); }
    .btn {
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 6px;
      padding: 4px 8px;
      cursor: pointer;
      font: inherit;
      line-height: 1.2;
    }
    .btn.primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .btn.primary:hover { background: var(--vscode-button-hoverBackground); }
    .btn.subtle {
      background: var(--vscode-button-secondaryBackground, var(--vscode-button-background));
      color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground));
    }
    .btn.subtle:hover {
      background: var(--vscode-button-secondaryHoverBackground, var(--vscode-button-hoverBackground));
    }
    .btn.inline-toggle {
      padding: 2px 6px;
      font-size: 11px;
    }
    .btn.danger {
      background: transparent;
      color: var(--vscode-editorError-foreground);
      border-color: var(--vscode-editorError-foreground);
    }
    .btn.danger:hover {
      background: color-mix(in srgb, var(--vscode-editorError-foreground) 18%, transparent);
    }
    .btn:focus-visible,
    .id-link:focus-visible,
    .explorer-crumb-link:focus-visible,
    .toc-link:focus-visible,
    .backlink-link:focus-visible,
    .filter-input:focus-visible {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 1px;
    }
    .id-link {
      border: 0;
      padding: 0;
      margin: 0;
      background: transparent;
      color: var(--vscode-textLink-foreground);
      text-decoration: underline;
      cursor: pointer;
      font: inherit;
    }
    .id-link:hover,
    .backlink-link:hover,
    .toc-link:hover { color: var(--vscode-textLink-activeForeground); }
    .empty {
      padding: 8px;
      border: 1px dashed var(--vscode-panel-border);
      border-radius: 8px;
      color: var(--vscode-descriptionForeground);
      line-height: 1.35;
    }
    .empty.tiny {
      font-size: 11px;
      padding: 6px;
    }
    .empty-panel,
    .error-panel {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      padding: 10px;
      line-height: 1.4;
      margin-bottom: 12px;
    }
    .empty-panel {
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-editorWidget-background);
    }
    .error-panel {
      color: var(--vscode-editorError-foreground);
      background: var(--vscode-editorWidget-background);
    }
  </style>
</head>
<body data-explorer-load-token="${state.explorerLoadToken}">
  ${content}
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const explorerIdentifierPatternSource = ${JSON.stringify(DEFAULT_IDENTIFIER_PATTERN)};
    const webviewState = vscode.getState() || {};
    const explorerLoadToken = Number(document.body.dataset.explorerLoadToken || 0);
    const previousExplorerLoadToken = Number(webviewState.lastExplorerLoadToken || 0);
    const didLoadNewExplorer = (
      Number.isFinite(explorerLoadToken)
      && explorerLoadToken > 0
      && explorerLoadToken !== previousExplorerLoadToken
    );

    const nextState = {
      ...webviewState,
      lastExplorerLoadToken: explorerLoadToken
    };

    if (didLoadNewExplorer) {
      // Explorer navigation should always land the user at the top.
      nextState.backlinkFocused = false;
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: 'auto' });
        setTimeout(() => {
          window.scrollTo({ top: 0, behavior: 'auto' });
        }, 0);
      });
    }

    vscode.setState(nextState);

    function linkifyExplorerIdentifiers(container) {
      if (!(container instanceof HTMLElement)) {
        return;
      }

      const skipTags = new Set(['A', 'CODE', 'PRE', 'SCRIPT', 'STYLE', 'TEXTAREA', 'BUTTON']);
      const shouldSkipNode = (textNode) => {
        if (!(textNode instanceof Text)) {
          return true;
        }
        const textValue = textNode.nodeValue || '';
        if (!textValue.trim()) {
          return true;
        }

        let current = textNode.parentElement;
        while (current && current !== container) {
          if (skipTags.has(current.tagName)) {
            return true;
          }
          current = current.parentElement;
        }

        return false;
      };

      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      const textNodes = [];
      let nextNode = walker.nextNode();
      while (nextNode) {
        if (nextNode instanceof Text) {
          textNodes.push(nextNode);
        }
        nextNode = walker.nextNode();
      }

      for (const textNode of textNodes) {
        if (shouldSkipNode(textNode)) {
          continue;
        }

        const textValue = textNode.nodeValue || '';
        const identifierRegex = new RegExp(explorerIdentifierPatternSource, 'g');
        if (!identifierRegex.test(textValue)) {
          continue;
        }

        identifierRegex.lastIndex = 0;
        const fragment = document.createDocumentFragment();
        let lastIndex = 0;
        let match = identifierRegex.exec(textValue);

        while (match) {
          const matchIndex = match.index;
          const identifier = match[0];
          if (matchIndex > lastIndex) {
            fragment.append(document.createTextNode(textValue.slice(lastIndex, matchIndex)));
          }

          const identifierLink = document.createElement('button');
          identifierLink.type = 'button';
          identifierLink.className = 'id-link md-id-link';
          identifierLink.dataset.action = 'openIdentifier';
          identifierLink.dataset.id = identifier.toUpperCase();
          identifierLink.textContent = identifier;
          fragment.append(identifierLink);

          lastIndex = identifierRegex.lastIndex;
          match = identifierRegex.exec(textValue);
        }

        if (lastIndex < textValue.length) {
          fragment.append(document.createTextNode(textValue.slice(lastIndex)));
        }

        textNode.replaceWith(fragment);
      }
    }

    for (const markdownContainer of document.querySelectorAll('.md-rendered')) {
      linkifyExplorerIdentifiers(markdownContainer);
    }

    const backlinkInput = document.getElementById('backlink-filter');
    if (backlinkInput) {
      if (typeof webviewState.backlinkValue === 'string' && webviewState.backlinkValue !== backlinkInput.value) {
        backlinkInput.value = webviewState.backlinkValue;
      }

      if (!didLoadNewExplorer && webviewState.backlinkFocused) {
        backlinkInput.focus();
        const start = typeof webviewState.backlinkSelectionStart === 'number'
          ? webviewState.backlinkSelectionStart
          : backlinkInput.value.length;
        const end = typeof webviewState.backlinkSelectionEnd === 'number'
          ? webviewState.backlinkSelectionEnd
          : start;
        try {
          backlinkInput.setSelectionRange(start, end);
        } catch {
          // no-op
        }
      }

      let filterDebounce;
      backlinkInput.addEventListener('input', () => {
        const selectionStart = backlinkInput.selectionStart ?? backlinkInput.value.length;
        const selectionEnd = backlinkInput.selectionEnd ?? selectionStart;
        vscode.setState({
          ...vscode.getState(),
          backlinkValue: backlinkInput.value,
          backlinkFocused: true,
          backlinkSelectionStart: selectionStart,
          backlinkSelectionEnd: selectionEnd
        });

        clearTimeout(filterDebounce);
        filterDebounce = setTimeout(() => {
          vscode.postMessage({ type: 'setBacklinkFilter', value: backlinkInput.value });
        }, 120);
      });

      backlinkInput.addEventListener('blur', () => {
        vscode.setState({
          ...vscode.getState(),
          backlinkFocused: false
        });
      });
    }

    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const link = target.closest('.md-rendered a[href]');
      if (!link) {
        return;
      }

      event.preventDefault();
      const href = link.getAttribute('href');
      if (!href) {
        return;
      }

      const container = link.closest('.md-rendered');
      const basePath = container ? (container.getAttribute('data-base-path') || '') : '';
      vscode.postMessage({
        type: 'openExternalLink',
        url: href,
        basePath
      });
    });

    for (const actionEl of document.querySelectorAll('[data-action]')) {
      const eventName = actionEl.tagName === 'INPUT' ? 'change' : 'click';
      actionEl.addEventListener(eventName, () => {
        const type = actionEl.dataset.action;
        if (!type) {
          return;
        }

        if (actionEl instanceof HTMLInputElement && (actionEl.type === 'radio' || actionEl.type === 'checkbox') && !actionEl.checked) {
          return;
        }

        const payload = { type };

        if (actionEl.dataset.key) {
          payload.key = actionEl.dataset.key;
        }

        if (actionEl.dataset.id) {
          payload.id = actionEl.dataset.id;
        }

        if (actionEl.dataset.prefix) {
          payload.prefix = actionEl.dataset.prefix;
        }

        if (actionEl.dataset.line) {
          payload.line = Number(actionEl.dataset.line);
        }

        if (actionEl.dataset.filePath) {
          payload.filePath = actionEl.dataset.filePath;
        }

        if (actionEl.dataset.index) {
          payload.index = Number(actionEl.dataset.index);
        }

        if (actionEl.dataset.url) {
          payload.url = actionEl.dataset.url;
        }

        if (actionEl.dataset.basePath) {
          payload.basePath = actionEl.dataset.basePath;
        }

        if (actionEl.dataset.value) {
          payload.value = actionEl.dataset.value;
        } else if (actionEl instanceof HTMLInputElement) {
          payload.value = actionEl.value;
        }

        vscode.postMessage(payload);
      });
    }
  </script>
</body>
</html>`;
}
function randomNonce(): string {
  return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

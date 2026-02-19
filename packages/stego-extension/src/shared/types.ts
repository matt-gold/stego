import * as vscode from 'vscode';

export type BibleRecord = {
  title?: string;
  description?: string;
  url?: string;
  path?: string;
  anchor?: string;
};

export type IdentifierMatch = {
  id: string;
  range: vscode.Range;
};

export type ParsedMarkdownDocument = {
  lineEnding: string;
  hasFrontmatter: boolean;
  frontmatter: Record<string, unknown>;
  body: string;
};

export type SidebarState = {
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

export type FrontmatterLineRange = {
  start: number;
  end: number;
};

export type SidebarMetadataEntry = {
  key: string;
  isBibleCategory: boolean;
  isArray: boolean;
  valueText: string;
  references: SidebarIdentifierLink[];
  arrayItems: SidebarMetadataArrayItem[];
};

export type SidebarMetadataArrayItem = {
  index: number;
  valueText: string;
  references: SidebarIdentifierLink[];
};

export type SidebarStatusControl = {
  options: string[];
  value?: string;
  invalidValue?: string;
};

export type SidebarIdentifierLink = {
  id: string;
  title: string;
  description: string;
  known: boolean;
  target?: string;
};

export type SidebarTocEntry = {
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

export type SidebarBacklink = {
  filePath: string;
  fileLabel: string;
  line: number;
  excerpt: string;
  count: number;
};

export type SidebarExplorerEntry = {
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

export type SidebarExplorerCategorySummary = {
  key: string;
  prefix: string;
  label: string;
  count: number;
};

export type SidebarExplorerCategoryItem = {
  id: string;
  title: string;
  description: string;
  known: boolean;
};

export type SidebarExplorerHomePage = {
  kind: 'home';
  categories: SidebarExplorerCategorySummary[];
};

export type SidebarExplorerCategoryPage = {
  kind: 'category';
  category: SidebarExplorerCategorySummary;
  items: SidebarExplorerCategoryItem[];
};

export type SidebarExplorerIdentifierPage = {
  kind: 'identifier';
  category?: SidebarExplorerCategorySummary;
  entry: SidebarExplorerEntry;
};

export type SidebarExplorerPage = SidebarExplorerHomePage | SidebarExplorerCategoryPage | SidebarExplorerIdentifierPage;

export type ExplorerRoute =
  | { kind: 'home' }
  | { kind: 'category'; key: string; prefix: string }
  | { kind: 'identifier'; id: string };

export type BibleSectionPreview = {
  heading: string;
  body: string;
  filePath: string;
  fileLabel: string;
  line: number;
};

export type ProjectBibleCategory = {
  key: string;
  prefix: string;
  notesFile?: string;
};

export type ProjectScanContext = {
  projectDir: string;
  projectMtimeMs: number;
  categories: ProjectBibleCategory[];
};

export type FileIdentifierUsage = {
  count: number;
  firstLine: number;
  firstExcerpt: string;
};

export type IndexedFileUsage = {
  mtimeMs: number;
  identifiers: Map<string, FileIdentifierUsage>;
};

export type ProjectReferenceIndex = {
  pattern: string;
  files: Map<string, IndexedFileUsage>;
  byIdentifier: Map<string, Map<string, FileIdentifierUsage>>;
};

export type ScriptRunResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type ProjectScriptContext = {
  document: vscode.TextDocument;
  projectDir: string;
  packagePath: string;
};

export type SidebarRenderContext = {
  webview: vscode.Webview;
  state: SidebarState;
  extensionUri: vscode.Uri;
};

export type SidebarMessage =
  | { type: 'addMetadataField' }
  | { type: 'editMetadataField'; key: string }
  | { type: 'removeMetadataField'; key: string }
  | { type: 'setMetadataStatus'; value: string }
  | { type: 'addMetadataArrayItem'; key: string }
  | { type: 'editMetadataArrayItem'; key: string; index: number }
  | { type: 'removeMetadataArrayItem'; key: string; index: number }
  | { type: 'toggleMetadataEditing' }
  | { type: 'runLocalValidate' }
  | { type: 'openMarkdownPreview' }
  | { type: 'toggleFrontmatter' }
  | { type: 'refresh' }
  | { type: 'openIdentifier'; id: string }
  | { type: 'openExplorerCategory'; key: string; prefix: string }
  | { type: 'explorerHome' }
  | { type: 'explorerBack' }
  | { type: 'explorerForward' }
  | { type: 'toggleExplorerBacklinks' }
  | { type: 'toggleExplorerCollapse' }
  | { type: 'reloadIdentifierIndex' }
  | { type: 'openTocHeading'; line: number }
  | { type: 'toggleTocBacklinks'; id: string }
  | { type: 'setBacklinkFilter'; value: string }
  | { type: 'openBacklink'; filePath: string; line: number }
  | { type: 'openExternalLink'; url: string; basePath?: string };

export type CommandContext = {
  indexService: {
    clear(): void;
    loadForDocument(document: vscode.TextDocument): Promise<Map<string, BibleRecord>>;
  };
  diagnostics: vscode.DiagnosticCollection;
};

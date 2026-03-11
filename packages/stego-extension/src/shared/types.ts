import * as vscode from 'vscode';
import type { ImageStyle } from '../../../shared/src/domain/images';

export type { ImageStyle };

export type SpineRecord = {
  label?: string;
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

export type SidebarImageEntry = {
  key: string;
  displayPath: string;
  destination: string;
  line: number;
  occurrenceCount: number;
  isExternal: boolean;
  hasOverride: boolean;
  defaultStyle: ImageStyle;
  overrideStyle: ImageStyle;
  effectiveStyle: ImageStyle;
};

export type SidebarState = {
  hasActiveMarkdown: boolean;
  showDocumentTab?: boolean;
  activeEditorPath?: string;
  documentTabDetached?: boolean;
  documentPath: string;
  projectDir?: string;
  structureSummary?: string;
  warnings: string[];
  canShowOverview: boolean;
  activeTab: SidebarViewTab;
  overview?: SidebarOverviewState;
  mode?: 'manuscript' | 'nonManuscript';
  parseError?: string;
  showExplorer: boolean;
  metadataCollapsed: boolean;
  metadataEditing: boolean;
  enableComments: boolean;
  statusControl?: SidebarStatusControl;
  metadataEntries: SidebarMetadataEntry[];
  imageEntries: SidebarImageEntry[];
  projectImageDefaults: ImageStyle;
  showMetadataPanel: boolean;
  explorer?: SidebarExplorerPage;
  pinnedExplorers: SidebarPinnedExplorerPanel[];
  canPinAllFromFile: boolean;
  explorerCollapsed: boolean;
  explorerCanGoBack: boolean;
  explorerCanGoForward: boolean;
  globalCanGoBack: boolean;
  globalCanGoForward: boolean;
  explorerCanGoHome: boolean;
  explorerLoadToken: number;
  tocEntries: SidebarTocEntry[];
  showToc: boolean;
  isSpineCategoryFile: boolean;
  backlinkFilter: string;
  comments: SidebarCommentsState;
};

export type SidebarViewTab = 'document' | 'spine' | 'overview';

export type SidebarOverviewStageCount = {
  status: string;
  count: number;
};

export type SidebarOverviewFirstUnresolved = {
  filePath: string;
  fileLabel: string;
  commentId: string;
};

export type SidebarOverviewFirstMissingMetadata = {
  filePath: string;
  fileLabel: string;
};

export type SidebarOverviewState = {
  manuscriptTitle: string;
  generatedAt: string;
  wordCount: number;
  manuscriptFileCount: number;
  missingRequiredMetadataCount: number;
  unresolvedCommentsCount: number;
  gateSnapshot: SidebarOverviewGateSnapshot;
  stageBreakdown: SidebarOverviewStageCount[];
  mapRows: SidebarOverviewMapRow[];
  firstUnresolvedComment?: SidebarOverviewFirstUnresolved;
  firstMissingMetadata?: SidebarOverviewFirstMissingMetadata;
};

export type SidebarOverviewGateSnapshot = {
  stageCheck: SidebarOverviewGateStatus;
  build: SidebarOverviewGateStatus;
};

export type SidebarOverviewGateStatus = {
  state: 'never' | 'success' | 'failed';
  updatedAt?: string;
  detail?: string;
  detailKind?: 'output' | 'warning' | 'error';
  stage?: string;
};

export type SidebarOverviewMapRow = SidebarOverviewGroupRow | SidebarOverviewFileRow;

export type SidebarOverviewGroupRow = {
  kind: 'group';
  level: number;
  label: string;
};

export type SidebarOverviewFileRow = {
  kind: 'file';
  filePath: string;
  fileLabel: string;
  status: string;
};

export type FrontmatterLineRange = {
  start: number;
  end: number;
};

export type SidebarMetadataEntry = {
  key: string;
  isStructural: boolean;
  isSpineCategory: boolean;
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

export type SidebarCommentStatus = 'open' | 'resolved';

export type SidebarCommentListItem = {
  id: string;
  status: SidebarCommentStatus;
  anchor: 'paragraph' | 'file';
  line: number;
  degraded: boolean;
  excerpt: string;
  author?: string;
  created?: string;
  message: string;
  isSelected: boolean;
  threadPosition?: 'first' | 'middle' | 'last';
};

export type SidebarCommentsState = {
  selectedId?: string;
  currentAuthor?: string;
  items: SidebarCommentListItem[];
  parseErrors: string[];
  totalCount: number;
  unresolvedCount: number;
};

export type SidebarExplorerEntry = {
  id: string;
  label: string;
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
  label: string;
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

export type SidebarPinnedExplorerPanel = {
  id: string;
  page: SidebarExplorerIdentifierPage;
  backlinkFilter: string;
  backlinksExpanded: boolean;
  collapsed: boolean;
};

export type ExplorerRoute =
  | { kind: 'home' }
  | { kind: 'category'; key: string; prefix: string }
  | { kind: 'identifier'; id: string };

export type SpineSectionPreview = {
  heading: string;
  label?: string;
  body: string;
  filePath: string;
  fileLabel: string;
  line: number;
};

export type ProjectSpineCategory = {
  key: string;
  prefix: string;
  notesFile?: string;
};

export type ProjectConfigIssue = {
  path: string;
  message: string;
};

export type ProjectScanContext = {
  projectDir: string;
  projectMtimeMs: number;
  projectTitle?: string;
  structuralKeys: string[];
  structuralLevels: ProjectStructuralLevel[];
  requiredMetadata: string[];
  imageDefaults: ImageStyle;
  categories: ProjectSpineCategory[];
  issues: ProjectConfigIssue[];
};

export type ProjectStructuralLevel = {
  key: string;
  label: string;
  titleKey?: string;
  headingTemplate: string;
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
  projectId: string;
  packagePath: string;
  hasPackageJson: boolean;
  scripts: Set<string>;
};

export type CommandContext = {
  indexService: {
    clear(): void;
    loadForDocument(document: vscode.TextDocument): Promise<Map<string, SpineRecord>>;
  };
  diagnostics: vscode.DiagnosticCollection;
};

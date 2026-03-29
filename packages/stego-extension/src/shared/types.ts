import * as vscode from 'vscode';
import type { ImageStyle } from '@stego-labs/shared/domain/images';
import type { ExportTarget, PresentationTarget } from '@stego-labs/shared/domain/templates';
import type {
  BranchLeafPolicy,
  EffectiveBranchLeafPolicy
} from '@stego-labs/shared/domain/content';

export type { ImageStyle };

export type LeafTargetRecord = {
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

export type SidebarTemplateEntry = {
  name: string;
  path: string;
  relativePath: string;
  supportedTargets: readonly ExportTarget[];
};

export type SidebarState = {
  hasActiveMarkdown: boolean;
  showDocumentTab?: boolean;
  activeEditorPath?: string;
  documentTabDetached?: boolean;
  documentPath: string;
  projectDir?: string;
  warnings: string[];
  canShowOverview: boolean;
  activeTab: SidebarViewTab;
  overviewLoading: boolean;
  overview?: SidebarOverviewState;
  documentKind?: 'leaf' | 'branchNotes';
  parseError?: string;
  showExplorer: boolean;
  metadataCollapsed: boolean;
  metadataEditing: boolean;
  enableComments: boolean;
  statusControl?: SidebarStatusControl;
  templates: SidebarTemplateEntry[];
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
  isBranchNotesFile: boolean;
  backlinkFilter: string;
  comments: SidebarCommentsState;
};

export type SidebarViewTab = 'document' | 'explore' | 'overview';

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

export type SidebarOverviewMapRow = {
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
  isBranch: boolean;
  isInherited: boolean;
  inheritedFrom?: string;
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

export type SidebarExplorerBranchSummary = {
  id: string;
  name: string;
  label: string;
  parentId?: string;
  directBranchCount: number;
  directLeafCount: number;
  directChildCount: number;
};

export type SidebarExplorerLeafItem = {
  id: string;
  label: string;
  title: string;
  description: string;
  known: boolean;
};

export type SidebarExplorerHomePage = {
  kind: 'home';
  branch: SidebarExplorerBranchSummary;
  childBranches: SidebarExplorerBranchSummary[];
  leafItems: SidebarExplorerLeafItem[];
  body?: string;
};

export type SidebarExplorerBranchPage = {
  kind: 'branch';
  branch: SidebarExplorerBranchSummary;
  childBranches: SidebarExplorerBranchSummary[];
  leafItems: SidebarExplorerLeafItem[];
  body?: string;
};

export type SidebarExplorerIdentifierPage = {
  kind: 'identifier';
  branch?: SidebarExplorerBranchSummary;
  entry: SidebarExplorerEntry;
};

export type SidebarExplorerPage = SidebarExplorerHomePage | SidebarExplorerBranchPage | SidebarExplorerIdentifierPage;

export type SidebarPinnedExplorerPanel = {
  id: string;
  page: SidebarExplorerIdentifierPage;
  backlinkFilter: string;
  backlinksExpanded: boolean;
  collapsed: boolean;
};

export type ExplorerRoute =
  | { kind: 'home' }
  | { kind: 'branch'; id: string }
  | { kind: 'identifier'; id: string };

export type LeafSectionPreview = {
  heading: string;
  label?: string;
  body: string;
  filePath: string;
  fileLabel: string;
  line: number;
};

export type ProjectBranch = {
  id: string;
  name: string;
  label: string;
  parentId?: string;
  relativeDir: string;
  notesFile?: string;
  leafPolicy: BranchLeafPolicy;
  effectiveLeafPolicy: EffectiveBranchLeafPolicy;
  body?: string;
};

export type ProjectTemplate = {
  name: string;
  path: string;
  relativePath: string;
  declaredTargets: readonly PresentationTarget[] | null;
  supportedTargets: readonly ExportTarget[];
};

export type ProjectConfigIssue = {
  path: string;
  message: string;
};

export type ProjectScanContext = {
  projectDir: string;
  projectMtimeMs: number;
  projectTitle?: string;
  manuscriptSubdir?: string;
  manuscriptDir: string;
  manuscriptScopeKey: string;
  imageDefaults: ImageStyle;
  branches: ProjectBranch[];
  templates: ProjectTemplate[];
  issues: ProjectConfigIssue[];
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
  project: ProjectScanContext;
  projectDir: string;
  projectId: string;
  packagePath: string;
  hasPackageJson: boolean;
  scripts: Set<string>;
};

export type CommandContext = {
  indexService: {
    clear(): void;
    loadForDocument(document: vscode.TextDocument): Promise<Map<string, LeafTargetRecord>>;
  };
  diagnostics: vscode.DiagnosticCollection;
};

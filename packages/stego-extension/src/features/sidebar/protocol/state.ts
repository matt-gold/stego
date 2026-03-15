import type { ImageStyle } from '@stego-labs/shared/domain/images';

export type SidebarViewTab = 'document' | 'explore' | 'overview';

export type SidebarIdentifierLink = {
  id: string;
  title: string;
  description: string;
  known: boolean;
  target?: string;
};

export type SidebarBacklink = {
  filePath: string;
  fileLabel: string;
  line: number;
  excerpt: string;
  count: number;
};

export type SidebarMetadataArrayItem = {
  index: number;
  valueText: string;
  references: SidebarIdentifierLink[];
};

export type SidebarMetadataEntry = {
  key: string;
  isStructural: boolean;
  isBranch: boolean;
  isArray: boolean;
  valueText: string;
  references: SidebarIdentifierLink[];
  arrayItems: SidebarMetadataArrayItem[];
};

export type SidebarStatusControl = {
  options: string[];
  value?: string;
  invalidValue?: string;
};

export type SidebarCommentStatus = 'open' | 'resolved';

export type SidebarWebviewCommentItem = {
  id: string;
  status: SidebarCommentStatus;
  anchor: 'paragraph' | 'file';
  line: number;
  degraded: boolean;
  excerpt: string;
  author?: string;
  created?: string;
  message: string;
  messageHtml: string;
  isSelected: boolean;
  threadPosition?: 'first' | 'middle' | 'last';
};

export type SidebarWebviewCommentsState = {
  selectedId?: string;
  currentAuthor?: string;
  items: SidebarWebviewCommentItem[];
  parseErrors: string[];
  totalCount: number;
  unresolvedCount: number;
};

export type SidebarOverviewGateStatus = {
  state: 'never' | 'success' | 'failed';
  updatedAt?: string;
  detail?: string;
  detailKind?: 'output' | 'warning' | 'error';
  stage?: string;
};

export type SidebarOverviewGateSnapshot = {
  stageCheck: SidebarOverviewGateStatus;
  build: SidebarOverviewGateStatus;
};

export type SidebarOverviewMapRow = {
  kind: 'file';
  filePath: string;
  fileLabel: string;
  status: string;
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
  stageBreakdown: Array<{ status: string; count: number }>;
  mapRows: SidebarOverviewMapRow[];
  firstUnresolvedComment?: SidebarOverviewFirstUnresolved;
  firstMissingMetadata?: SidebarOverviewFirstMissingMetadata;
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

export type SidebarExplorerEntry = {
  id: string;
  label: string;
  known: boolean;
  title: string;
  description: string;
  sourceHeading?: string;
  sourceBody?: string;
  sourceBodyHtml?: string;
  sourceFilePath?: string;
  sourceFileLabel?: string;
  sourceLine?: number;
  backlinks: SidebarBacklink[];
  backlinksExpanded: boolean;
};

export type SidebarExplorerBranchSummary = {
  key: string;
  name: string;
  label: string;
  parentKey?: string;
  directLeafCount: number;
};

export type SidebarExplorerLeafItem = {
  id: string;
  label: string;
  title: string;
  description: string;
  known: boolean;
};

export type SidebarExplorerPage =
  | {
    kind: 'home';
    branch: SidebarExplorerBranchSummary;
    childBranches: SidebarExplorerBranchSummary[];
    leafItems: SidebarExplorerLeafItem[];
    body?: string;
  }
  | {
    kind: 'branch';
    branch: SidebarExplorerBranchSummary;
    childBranches: SidebarExplorerBranchSummary[];
    leafItems: SidebarExplorerLeafItem[];
    body?: string;
  }
  | {
    kind: 'identifier';
    branch?: SidebarExplorerBranchSummary;
    entry: SidebarExplorerEntry;
  };

export type SidebarPinnedExplorerPanel = {
  id: string;
  page: Extract<SidebarExplorerPage, { kind: 'identifier' }>;
  backlinkFilter: string;
  backlinksExpanded: boolean;
  collapsed: boolean;
};

export type SidebarWebviewImageEntry = {
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
  thumbnailSrc?: string;
};

export type SidebarWebviewState = {
  hasActiveMarkdown: boolean;
  showDocumentTab?: boolean;
  activeEditorPath?: string;
  documentTabDetached?: boolean;
  documentPath: string;
  documentTitle: string;
  documentFilename: string;
  documentFileStem: string;
  showReferenceFilenameSubtitle: boolean;
  projectDir?: string;
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
  imageEntries: SidebarWebviewImageEntry[];
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
  comments: SidebarWebviewCommentsState;
};

import type { SidebarWebviewState } from '@sidebar-protocol';

export function createSidebarState(overrides: Partial<SidebarWebviewState> = {}): SidebarWebviewState {
  return {
    hasActiveMarkdown: true,
    showDocumentTab: true,
    activeEditorPath: '/tmp/project/manuscript/001-test.md',
    documentTabDetached: false,
    documentPath: '/tmp/project/manuscript/001-test.md',
    documentTitle: 'Test',
    documentFilename: '001-test.md',
    documentFileStem: '001-test',
    showReferenceFilenameSubtitle: false,
    projectDir: '/tmp/project',
    warnings: [],
    canShowOverview: true,
    activeTab: 'document',
    mode: 'manuscript',
    showExplorer: true,
    metadataCollapsed: false,
    metadataEditing: false,
    enableComments: true,
    templates: [],
    metadataEntries: [],
    imageEntries: [],
    projectImageDefaults: {},
    showMetadataPanel: true,
    pinnedExplorers: [],
    canPinAllFromFile: false,
    explorerCollapsed: false,
    explorerCanGoBack: false,
    explorerCanGoForward: false,
    globalCanGoBack: false,
    globalCanGoForward: false,
    explorerCanGoHome: false,
    explorerLoadToken: 0,
    tocEntries: [],
    showToc: false,
    isBranchNotesFile: false,
    backlinkFilter: '',
    comments: {
      items: [],
      parseErrors: [],
      totalCount: 0,
      unresolvedCount: 0
    },
    ...overrides
  };
}

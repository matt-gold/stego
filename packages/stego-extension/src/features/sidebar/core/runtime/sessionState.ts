import type { ExplorerRoute, SidebarState, SidebarViewTab } from '../../../../shared/types';
import type { PinnedSpineEntryState } from '../../tabs/spine';

export type SidebarSessionState = {
  activeTab: SidebarViewTab;
  metadataCollapsed: boolean;
  metadataEditing: boolean;
  selectedCommentId?: string;
  explorerRoute: ExplorerRoute;
  explorerCollapsed: boolean;
  explorerBacklinksExpanded: boolean;
  explorerLoadToken: number;
  tabBackStack: SidebarViewTab[];
  tabForwardStack: SidebarViewTab[];
  documentBackStack: SidebarState[];
  documentForwardStack: SidebarState[];
  pinnedByProject: Map<string, PinnedSpineEntryState[]>;
};

import type { SidebarViewTab } from '../../../../shared/types';
import type { SidebarSessionState } from './sessionState';

export function reduceSetTab(session: SidebarSessionState, nextTab: SidebarViewTab): SidebarSessionState {
  if (session.activeTab === nextTab) {
    return session;
  }

  return {
    ...session,
    tabBackStack: [...session.tabBackStack, session.activeTab],
    tabForwardStack: [],
    activeTab: nextTab
  };
}

export function reduceToggleMetadataCollapsed(session: SidebarSessionState): SidebarSessionState {
  return {
    ...session,
    metadataCollapsed: !session.metadataCollapsed
  };
}

export function reduceToggleMetadataEditing(session: SidebarSessionState): SidebarSessionState {
  return {
    ...session,
    metadataEditing: !session.metadataEditing
  };
}

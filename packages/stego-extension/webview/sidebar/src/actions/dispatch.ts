import type { SidebarActionMessage } from '@sidebar-protocol';
import { postSidebarAction } from '../bridge/protocol';

export function dispatchSidebarAction(action: SidebarActionMessage): void {
  postSidebarAction(action);
}

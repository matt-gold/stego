import type { SidebarActionMessage, SidebarWebviewState } from '../../protocol';
import type { RefreshMode } from '../sidebarProvider.types';

export type SidebarRuntimeEvent =
  | { type: 'action.received'; action: SidebarActionMessage }
  | { type: 'refresh.requested'; mode: RefreshMode }
  | { type: 'state.posted'; state: SidebarWebviewState }
  | { type: 'action.error'; actionType: SidebarActionMessage['type']; message: string };

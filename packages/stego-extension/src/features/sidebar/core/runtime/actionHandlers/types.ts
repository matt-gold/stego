import type { SidebarActionMessage } from '../../../protocol';
import type { SidebarRuntime } from '../sidebarRuntime';

export type SidebarDomainActionHandler = (
  runtime: SidebarRuntime,
  action: SidebarActionMessage
) => Promise<boolean>;

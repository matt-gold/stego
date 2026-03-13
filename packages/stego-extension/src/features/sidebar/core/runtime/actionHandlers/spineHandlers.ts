import type { SidebarDomainActionHandler } from './types';

export const handleSpineActions: SidebarDomainActionHandler = async (runtime, action) => {
  return runtime.handleSpineAction(action);
};

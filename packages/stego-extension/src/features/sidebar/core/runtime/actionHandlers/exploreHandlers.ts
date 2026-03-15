import type { SidebarDomainActionHandler } from './types';

export const handleExploreActions: SidebarDomainActionHandler = async (runtime, action) => {
  return runtime.handleExploreAction(action);
};

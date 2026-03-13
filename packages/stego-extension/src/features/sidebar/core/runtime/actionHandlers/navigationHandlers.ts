import type { SidebarDomainActionHandler } from './types';

export const handleNavigationActions: SidebarDomainActionHandler = async (runtime, action) => {
  return runtime.handleNavigationAction(action);
};

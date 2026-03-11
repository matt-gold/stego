import type { SidebarDomainActionHandler } from './types';

export const handleOverviewActions: SidebarDomainActionHandler = async (runtime, action) => {
  return runtime.handleOverviewAction(action);
};

import type { SidebarDomainActionHandler } from './types';

export const handleUiActions: SidebarDomainActionHandler = async (runtime, action) => {
  return runtime.handleUiAction(action);
};

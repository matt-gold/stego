import type { SidebarDomainActionHandler } from './types';

export const handleImageActions: SidebarDomainActionHandler = async (runtime, action) => {
  return runtime.handleImageAction(action);
};

import type { SidebarDomainActionHandler } from './types';

export const handleCommentActions: SidebarDomainActionHandler = async (runtime, action) => {
  return runtime.handleCommentAction(action);
};

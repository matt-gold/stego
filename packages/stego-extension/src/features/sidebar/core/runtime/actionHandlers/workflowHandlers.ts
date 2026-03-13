import type { SidebarDomainActionHandler } from './types';

export const handleWorkflowActions: SidebarDomainActionHandler = async (runtime, action) => {
  return runtime.handleWorkflowAction(action);
};

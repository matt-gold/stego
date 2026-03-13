import type { SidebarDomainActionHandler } from './types';

export const handleMetadataActions: SidebarDomainActionHandler = async (runtime, action) => {
  return runtime.handleMetadataAction(action);
};

import type { SidebarDomainActionHandler } from './types';
import { handleUiActions } from './uiHandlers';
import { handleNavigationActions } from './navigationHandlers';
import { handleMetadataActions } from './metadataHandlers';
import { handleImageActions } from './imagesHandlers';
import { handleExploreActions } from './exploreHandlers';
import { handleCommentActions } from './commentsHandlers';
import { handleWorkflowActions } from './workflowHandlers';
import { handleOverviewActions } from './overviewHandlers';

export const SIDEBAR_ACTION_HANDLERS: SidebarDomainActionHandler[] = [
  handleUiActions,
  handleNavigationActions,
  handleMetadataActions,
  handleImageActions,
  handleExploreActions,
  handleCommentActions,
  handleWorkflowActions,
  handleOverviewActions
];

import type { SidebarViewTab } from './state';

type NoPayload<TType extends string> = {
  type: TType;
};

export type SidebarActionMessage =
  | { type: 'ui.setTab'; value: SidebarViewTab }
  | NoPayload<'ui.refresh'>
  | NoPayload<'nav.globalBack'>
  | NoPayload<'nav.globalForward'>
  | NoPayload<'metadata.toggleCollapse'>
  | NoPayload<'metadata.toggleEditing'>
  | NoPayload<'metadata.addField'>
  | { type: 'metadata.editField'; key: string }
  | { type: 'metadata.removeField'; key: string }
  | { type: 'metadata.setStatus'; value: string }
  | { type: 'metadata.addArrayItem'; key: string }
  | { type: 'metadata.editArrayItem'; key: string; index: number }
  | { type: 'metadata.removeArrayItem'; key: string; index: number }
  | NoPayload<'metadata.fillRequired'>
  | { type: 'images.editFormat'; key: string }
  | { type: 'images.resetToDefaults'; key: string }
  | NoPayload<'images.insertFromFilePicker'>
  | NoPayload<'doc.openPreview'>
  | NoPayload<'doc.toggleFrontmatterFold'>
  | NoPayload<'doc.copyCleanText'>
  | { type: 'doc.openHeadingLine'; line: number }
  | { type: 'doc.toggleTocBacklinks'; id: string }
  | { type: 'doc.openBacklink'; filePath: string; line?: number }
  | { type: 'doc.openExternalLink'; url: string; basePath?: string }
  | { type: 'explore.openIdentifier'; id: string }
  | { type: 'explore.openBranch'; key: string }
  | NoPayload<'explore.goHome'>
  | NoPayload<'explore.goBack'>
  | NoPayload<'explore.goForward'>
  | NoPayload<'explore.toggleExplorerCollapse'>
  | NoPayload<'explore.toggleBacklinks'>
  | { type: 'explore.setBacklinkFilter'; value: string }
  | NoPayload<'explore.createBranch'>
  | NoPayload<'explore.pinActiveEntry'>
  | NoPayload<'explore.pinAllFromDocument'>
  | { type: 'explore.unpinEntry'; id: string }
  | NoPayload<'explore.unpinAll'>
  | { type: 'explore.togglePinnedBacklinks'; id: string }
  | { type: 'explore.togglePinnedCollapse'; id: string }
  | { type: 'explore.setPinnedBacklinkFilter'; id: string; value: string }
  | NoPayload<'explore.rebuildIndex'>
  | NoPayload<'comments.add'>
  | { type: 'comments.selectThread'; id: string }
  | { type: 'comments.reply'; id: string }
  | { type: 'comments.toggleResolved'; id: string; resolveThread?: boolean }
  | { type: 'comments.delete'; id: string }
  | { type: 'comments.jumpTo'; id: string }
  | NoPayload<'comments.clearResolved'>
  | NoPayload<'workflow.validateCurrentFile'>
  | NoPayload<'workflow.compile'>
  | NoPayload<'workflow.stageCheck'>
  | NoPayload<'workflow.newManuscript'>
  | { type: 'overview.openFile'; filePath: string }
  | { type: 'overview.openFirstMissingMetadata'; filePath: string }
  | { type: 'overview.openFirstUnresolvedComment'; filePath: string; commentId: string };

export const SIDEBAR_ACTION_TYPES = [
  'ui.setTab',
  'ui.refresh',
  'nav.globalBack',
  'nav.globalForward',
  'metadata.toggleCollapse',
  'metadata.toggleEditing',
  'metadata.addField',
  'metadata.editField',
  'metadata.removeField',
  'metadata.setStatus',
  'metadata.addArrayItem',
  'metadata.editArrayItem',
  'metadata.removeArrayItem',
  'metadata.fillRequired',
  'images.editFormat',
  'images.resetToDefaults',
  'images.insertFromFilePicker',
  'doc.openPreview',
  'doc.toggleFrontmatterFold',
  'doc.copyCleanText',
  'doc.openHeadingLine',
  'doc.toggleTocBacklinks',
  'doc.openBacklink',
  'doc.openExternalLink',
  'explore.openIdentifier',
  'explore.openBranch',
  'explore.goHome',
  'explore.goBack',
  'explore.goForward',
  'explore.toggleExplorerCollapse',
  'explore.toggleBacklinks',
  'explore.setBacklinkFilter',
  'explore.createBranch',
  'explore.pinActiveEntry',
  'explore.pinAllFromDocument',
  'explore.unpinEntry',
  'explore.unpinAll',
  'explore.togglePinnedBacklinks',
  'explore.togglePinnedCollapse',
  'explore.setPinnedBacklinkFilter',
  'explore.rebuildIndex',
  'comments.add',
  'comments.selectThread',
  'comments.reply',
  'comments.toggleResolved',
  'comments.delete',
  'comments.jumpTo',
  'comments.clearResolved',
  'workflow.validateCurrentFile',
  'workflow.compile',
  'workflow.stageCheck',
  'workflow.newManuscript',
  'overview.openFile',
  'overview.openFirstMissingMetadata',
  'overview.openFirstUnresolvedComment'
] as const;

export type SidebarActionType = SidebarActionMessage['type'];

export type SidebarInboundMessage =
  | { type: 'ready' }
  | SidebarActionMessage;

export type SidebarHostMessage<TState> = {
  type: 'state';
  state: TState;
};

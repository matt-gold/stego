import type { SidebarViewTab } from './state';
import { SIDEBAR_ACTION_TYPES, type SidebarActionMessage, type SidebarInboundMessage } from './messages';

const SIDEBAR_ACTION_TYPE_SET = new Set<string>(SIDEBAR_ACTION_TYPES as readonly string[]);

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function asString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function asNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === 'boolean' ? value : undefined;
}

function asTabValue(value: string): SidebarViewTab | undefined {
  if (value === 'document' || value === 'spine' || value === 'overview') {
    return value;
  }
  return undefined;
}

function parseAction(record: Record<string, unknown>, type: SidebarActionMessage['type']): SidebarActionMessage | undefined {
  switch (type) {
    case 'ui.setTab': {
      const value = asString(record, 'value');
      const tab = value ? asTabValue(value) : undefined;
      return tab ? { type, value: tab } : undefined;
    }
    case 'metadata.editField':
    case 'metadata.removeField':
    case 'metadata.addArrayItem':
    case 'images.editFormat':
    case 'images.resetToDefaults':
    case 'spine.openIdentifier':
    case 'spine.unpinEntry':
    case 'spine.togglePinnedBacklinks':
    case 'spine.togglePinnedCollapse':
    case 'comments.selectThread':
    case 'comments.reply':
    case 'comments.delete':
    case 'comments.jumpTo':
    case 'doc.toggleTocBacklinks': {
      const idOrKey = asString(record, type.startsWith('metadata.') || type.startsWith('images.') ? 'key' : 'id');
      if (!idOrKey) {
        return undefined;
      }
      if (type === 'metadata.editField' || type === 'metadata.removeField' || type === 'metadata.addArrayItem') {
        return { type, key: idOrKey };
      }
      if (type === 'images.editFormat' || type === 'images.resetToDefaults') {
        return { type, key: idOrKey };
      }
      if (type === 'doc.toggleTocBacklinks') {
        return { type, id: idOrKey };
      }
      return { type, id: idOrKey };
    }
    case 'metadata.setStatus':
    case 'spine.setBacklinkFilter': {
      const value = asString(record, 'value');
      if (!value) {
        return undefined;
      }
      return { type, value };
    }
    case 'metadata.editArrayItem':
    case 'metadata.removeArrayItem': {
      const key = asString(record, 'key');
      const index = asNumber(record, 'index');
      if (!key || index === undefined || !Number.isInteger(index) || index < 0) {
        return undefined;
      }
      return { type, key, index };
    }
    case 'doc.openHeadingLine': {
      const line = asNumber(record, 'line');
      if (line === undefined || !Number.isInteger(line) || line < 1) {
        return undefined;
      }
      return { type, line };
    }
    case 'doc.openBacklink': {
      const filePath = asString(record, 'filePath');
      if (!filePath) {
        return undefined;
      }
      const line = asNumber(record, 'line');
      return line !== undefined ? { type, filePath, line } : { type, filePath };
    }
    case 'doc.openExternalLink': {
      const url = asString(record, 'url');
      if (!url) {
        return undefined;
      }
      const basePath = asString(record, 'basePath');
      return basePath ? { type, url, basePath } : { type, url };
    }
    case 'spine.openCategory': {
      const key = asString(record, 'key');
      const prefix = asString(record, 'prefix');
      if (!key || !prefix) {
        return undefined;
      }
      return { type, key, prefix };
    }
    case 'spine.setPinnedBacklinkFilter': {
      const id = asString(record, 'id');
      const value = asString(record, 'value');
      if (!id || value === undefined) {
        return undefined;
      }
      return { type, id, value };
    }
    case 'comments.toggleResolved': {
      const id = asString(record, 'id');
      if (!id) {
        return undefined;
      }
      const resolveThread = asBoolean(record, 'resolveThread');
      return resolveThread === undefined ? { type, id } : { type, id, resolveThread };
    }
    case 'overview.openFile':
    case 'overview.openFirstMissingMetadata': {
      const filePath = asString(record, 'filePath');
      if (!filePath) {
        return undefined;
      }
      return { type, filePath };
    }
    case 'overview.openFirstUnresolvedComment': {
      const filePath = asString(record, 'filePath');
      const commentId = asString(record, 'commentId');
      if (!filePath || !commentId) {
        return undefined;
      }
      return { type, filePath, commentId };
    }
    case 'ui.refresh':
    case 'nav.globalBack':
    case 'nav.globalForward':
    case 'metadata.toggleCollapse':
    case 'metadata.toggleEditing':
    case 'metadata.addField':
    case 'metadata.fillRequired':
    case 'images.insertFromFilePicker':
    case 'doc.openPreview':
    case 'doc.toggleFrontmatterFold':
    case 'doc.copyCleanText':
    case 'spine.goHome':
    case 'spine.goBack':
    case 'spine.goForward':
    case 'spine.toggleExplorerCollapse':
    case 'spine.toggleBacklinks':
    case 'spine.createCategory':
    case 'spine.pinActiveEntry':
    case 'spine.pinAllFromDocument':
    case 'spine.unpinAll':
    case 'spine.rebuildIndex':
    case 'comments.add':
    case 'comments.clearResolved':
    case 'workflow.validateCurrentFile':
    case 'workflow.compile':
    case 'workflow.stageCheck':
    case 'workflow.newManuscript':
      return { type } as SidebarActionMessage;
    default:
      return undefined;
  }
}

export function parseSidebarInboundMessage(value: unknown): SidebarInboundMessage | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const type = asString(record, 'type');
  if (!type) {
    return undefined;
  }

  if (type === 'ready') {
    return { type: 'ready' };
  }

  if (!SIDEBAR_ACTION_TYPE_SET.has(type)) {
    return undefined;
  }

  return parseAction(record, type as SidebarActionMessage['type']);
}

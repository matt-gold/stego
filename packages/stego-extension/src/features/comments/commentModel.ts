import type { SidebarCommentListItem, SidebarCommentsState } from '../../shared/types';
import { getCommentThreadKey } from './commentThreadKey';
import type { StegoCommentDocumentState, StegoCommentThread } from './commentTypes';
import type { CommentAddPayload, CommentSyncAnchorsPayload } from '../../../../shared/src/contracts/cli';

export type AddCommentSelection = {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
};

export type BuildAddCommentPayloadInput = {
  message: string;
  author?: string;
  selection?: AddCommentSelection;
  cursorLine: number;
};

export type TrackedAnchorForSync = {
  id: string;
  dirty: boolean;
  deleted: boolean;
  start: { line: number; character: number };
  end: { line: number; character: number };
};

export type DecorationOverlayEntry = {
  id: string;
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
  deleted: boolean;
};

export type DecorationCommentEntry = {
  id: string;
  status: 'open' | 'resolved';
  thread: string[];
  createdAt?: string;
  line: number;
  underlineStartLine?: number;
  underlineStartCol?: number;
  underlineEndLine?: number;
  underlineEndCol?: number;
  paragraphEndLine?: number;
};

export function buildAddCommentPayload(input: BuildAddCommentPayloadInput): CommentAddPayload {
  const payload: CommentAddPayload = {
    message: input.message,
    author: input.author
  };

  const selection = input.selection;
  if (selection && isValidSelection(selection)) {
    payload.anchor = {
      range: {
        start: {
          line: selection.startLine,
          col: selection.startCol
        },
        end: {
          line: selection.endLine,
          col: selection.endCol
        }
      }
    };
    return payload;
  }

  payload.anchor = {
    cursor_line: input.cursorLine
  };
  return payload;
}

export function buildSyncAnchorsPayload(
  tracked: readonly TrackedAnchorForSync[],
  deletedIds: readonly string[]
): CommentSyncAnchorsPayload {
  const updates = tracked
    .filter((entry) => entry.dirty && !entry.deleted)
    .map((entry) => ({
      id: entry.id,
      start: {
        line: entry.start.line + 1,
        col: entry.start.character
      },
      end: {
        line: entry.end.line + 1,
        col: entry.end.character
      }
    }))
    .filter((entry) => {
      return entry.start.line < entry.end.line
        || (entry.start.line === entry.end.line && entry.start.col < entry.end.col);
    });

  const deleteIdSet = new Set(
    deletedIds
      .map((id) => id.trim().toUpperCase())
      .filter((id) => id.length > 0)
  );

  return {
    updates,
    delete_ids: [...deleteIdSet]
  };
}

export function buildSidebarCommentsState(
  state: StegoCommentDocumentState | undefined,
  selectedId?: string
): SidebarCommentsState {
  if (!state) {
    return emptySidebarCommentsState();
  }

  const normalizedSelection = selectedId?.trim().toUpperCase();

  const sortedComments = [...state.comments].sort((a, b) => {
    const aTime = getSortTimestamp(a);
    const bTime = getSortTimestamp(b);
    if (aTime !== bTime) {
      return bTime.localeCompare(aTime);
    }
    return a.id.localeCompare(b.id);
  });

  const selectedExists = normalizedSelection
    ? sortedComments.some((comment) => comment.id.toUpperCase() === normalizedSelection)
    : false;
  const normalizedSelectedId = selectedExists ? normalizedSelection : undefined;

  type ItemWithKey = SidebarCommentListItem & { _threadKey?: string };

  const items: ItemWithKey[] = sortedComments.map((comment) => {
    const anchor = state.anchorsById[comment.id] ?? {
      anchorType: comment.paragraphIndex !== undefined ? 'paragraph' as const : 'file' as const,
      line: 1,
      degraded: true
    };
    const firstMessage = parseThreadEntry(comment.thread[0] ?? '');
    const created = comment.createdAt || firstMessage.timestamp;
    const author = firstMessage.author;
    const message = firstMessage.message || '(No message)';

    return {
      id: comment.id,
      status: comment.status,
      anchor: anchor.anchorType,
      line: anchor.line,
      degraded: anchor.degraded,
      excerpt: comment.excerpt?.trim() || compactExcerpt(message),
      author,
      created,
      message,
      isSelected: normalizedSelectedId === comment.id.toUpperCase(),
      _threadKey: getCommentThreadKey(comment)
    };
  });

  const threadGroups = new Map<string, ItemWithKey[]>();
  for (const item of items) {
    const key = item._threadKey ?? '';
    let group = threadGroups.get(key);
    if (!group) {
      group = [];
      threadGroups.set(key, group);
    }
    group.push(item);
  }

  const standaloneItems: ItemWithKey[] = [];
  const multiGroups: ItemWithKey[][] = [];

  for (const group of threadGroups.values()) {
    if (group.length < 2) {
      standaloneItems.push(...group);
    } else {
      group.sort((a, b) => {
        const aTime = a.created ?? '';
        const bTime = b.created ?? '';
        if (aTime !== bTime) {
          return aTime.localeCompare(bTime);
        }
        return a.id.localeCompare(b.id);
      });
      multiGroups.push(group);
    }
  }

  multiGroups.sort((a, b) => {
    const aOldest = a[0]?.created ?? '';
    const bOldest = b[0]?.created ?? '';
    if (aOldest !== bOldest) {
      return bOldest.localeCompare(aOldest);
    }
    return (b[0]?.id ?? '').localeCompare(a[0]?.id ?? '');
  });

  for (const group of multiGroups) {
    for (let index = 0; index < group.length; index += 1) {
      group[index].threadPosition = index === 0
        ? 'first'
        : index === group.length - 1
          ? 'last'
          : 'middle';
    }
  }

  type Placeable = { sortKey: string; items: ItemWithKey[] };
  const placeables: Placeable[] = [];

  for (const group of multiGroups) {
    placeables.push({ sortKey: group[0]?.created ?? '', items: group });
  }
  for (const item of standaloneItems) {
    placeables.push({ sortKey: item.created ?? '', items: [item] });
  }

  placeables.sort((a, b) => {
    if (a.sortKey !== b.sortKey) {
      return b.sortKey.localeCompare(a.sortKey);
    }
    return (b.items[0]?.id ?? '').localeCompare(a.items[0]?.id ?? '');
  });

  const finalItems: SidebarCommentListItem[] = [];
  for (const placeable of placeables) {
    for (const item of placeable.items) {
      const { _threadKey, ...clean } = item;
      finalItems.push(clean);
    }
  }

  return {
    selectedId: normalizedSelectedId,
    items: finalItems,
    parseErrors: state.parseErrors,
    totalCount: state.totalCount,
    unresolvedCount: state.unresolvedCount
  };
}

export function buildDecorationCommentEntries(
  state: StegoCommentDocumentState | undefined,
  overlay: readonly DecorationOverlayEntry[]
): DecorationCommentEntry[] {
  if (!state || state.parseErrors.length > 0 || state.comments.length === 0) {
    return [];
  }

  const overlayById = new Map(overlay.map((entry) => [entry.id, entry]));
  const entries: DecorationCommentEntry[] = [];

  for (const comment of state.comments) {
    const tracked = overlayById.get(comment.id);
    if (tracked?.deleted) {
      continue;
    }

    const anchor = state.anchorsById[comment.id] ?? {
      anchorType: comment.paragraphIndex !== undefined ? 'paragraph' as const : 'file' as const,
      line: 1,
      degraded: true
    };

    entries.push({
      id: comment.id,
      status: comment.status,
      thread: [...comment.thread],
      createdAt: comment.createdAt,
      line: anchor.line,
      underlineStartLine: tracked?.startLine ?? anchor.underlineStartLine,
      underlineStartCol: tracked?.startCol ?? anchor.underlineStartCol,
      underlineEndLine: tracked?.endLine ?? anchor.underlineEndLine,
      underlineEndCol: tracked?.endCol ?? anchor.underlineEndCol,
      paragraphEndLine: anchor.paragraphEndLine
    });
  }

  return entries;
}

export function emptySidebarCommentsState(): SidebarCommentsState {
  return {
    selectedId: undefined,
    currentAuthor: undefined,
    items: [],
    parseErrors: [],
    totalCount: 0,
    unresolvedCount: 0
  };
}

export function parseThreadEntry(entry: string): { timestamp: string; author: string; message: string } {
  const firstPipe = entry.indexOf('|');
  if (firstPipe < 0) {
    return {
      timestamp: '',
      author: 'Unknown',
      message: entry.trim()
    };
  }

  const secondPipe = entry.indexOf('|', firstPipe + 1);
  if (secondPipe < 0) {
    return {
      timestamp: entry.slice(0, firstPipe).trim(),
      author: 'Unknown',
      message: entry.slice(firstPipe + 1).trim()
    };
  }

  return {
    timestamp: entry.slice(0, firstPipe).trim(),
    author: entry.slice(firstPipe + 1, secondPipe).trim() || 'Unknown',
    message: entry.slice(secondPipe + 1).trim()
  };
}

function getSortTimestamp(comment: StegoCommentThread): string {
  if (comment.createdAt) {
    const createdDate = new Date(comment.createdAt);
    if (!isNaN(createdDate.getTime())) {
      return createdDate.toISOString();
    }
  }

  const firstMessage = comment.thread[0];
  if (!firstMessage) {
    return '';
  }

  const raw = parseThreadEntry(firstMessage).timestamp;
  const date = new Date(raw);
  return isNaN(date.getTime()) ? raw : date.toISOString();
}

function compactExcerpt(value: string, max = 180): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) {
    return compact;
  }
  return `${compact.slice(0, max - 1)}…`;
}

function isValidSelection(selection: AddCommentSelection): boolean {
  return selection.startLine < selection.endLine
    || (selection.startLine === selection.endLine && selection.startCol < selection.endCol);
}

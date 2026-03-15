import type { ExplorerRoute } from '../../../../shared/types';

export const EXPLORER_PIN_LIMIT = 10;

export type PinnedExplorerEntryState = {
  id: string;
  backlinkFilter: string;
  backlinksExpanded: boolean;
  collapsed: boolean;
};

export type ActiveExplorerState = {
  route: ExplorerRoute;
  backStack: ExplorerRoute[];
  forwardStack: ExplorerRoute[];
  backlinksExpanded: boolean;
  backlinkFilter: string;
  loadToken: number;
};

export type PinResultKind = 'pinned' | 'duplicate' | 'limit' | 'invalid';

export type PinResult = {
  kind: PinResultKind;
  entries: PinnedExplorerEntryState[];
  pinnedId?: string;
};

export function normalizePinnedIdentifier(identifier: string): string {
  return identifier.trim().toUpperCase();
}

export function pinExplorerEntry(
  entries: PinnedExplorerEntryState[],
  route: ExplorerRoute,
  limit = EXPLORER_PIN_LIMIT
): PinResult {
  if (route.kind !== 'identifier') {
    return { kind: 'invalid', entries };
  }

  const id = normalizePinnedIdentifier(route.id);
  if (!id) {
    return { kind: 'invalid', entries };
  }

  if (entries.some((entry) => entry.id === id)) {
    return { kind: 'duplicate', entries };
  }

  if (entries.length >= limit) {
    return { kind: 'limit', entries };
  }

  return {
    kind: 'pinned',
    pinnedId: id,
    entries: [
      ...entries,
      {
        id,
        backlinkFilter: '',
        backlinksExpanded: false,
        collapsed: false
      }
    ]
  };
}

export function unpinExplorerEntry(
  entries: PinnedExplorerEntryState[],
  id: string
): { entries: PinnedExplorerEntryState[]; removed: boolean } {
  const normalizedId = normalizePinnedIdentifier(id);
  if (!normalizedId) {
    return { entries, removed: false };
  }

  const nextEntries = entries.filter((entry) => entry.id !== normalizedId);
  return {
    entries: nextEntries,
    removed: nextEntries.length !== entries.length
  };
}

export function togglePinnedExplorerBacklinks(
  entries: PinnedExplorerEntryState[],
  id: string
): { entries: PinnedExplorerEntryState[]; toggled: boolean } {
  const normalizedId = normalizePinnedIdentifier(id);
  if (!normalizedId) {
    return { entries, toggled: false };
  }

  let toggled = false;
  const nextEntries = entries.map((entry) => {
    if (entry.id !== normalizedId) {
      return entry;
    }

    toggled = true;
    return {
      ...entry,
      backlinksExpanded: !entry.backlinksExpanded
    };
  });

  return { entries: nextEntries, toggled };
}

export function setPinnedExplorerBacklinkFilter(
  entries: PinnedExplorerEntryState[],
  id: string,
  value: string
): { entries: PinnedExplorerEntryState[]; updated: boolean } {
  const normalizedId = normalizePinnedIdentifier(id);
  if (!normalizedId) {
    return { entries, updated: false };
  }

  let updated = false;
  const nextEntries = entries.map((entry) => {
    if (entry.id !== normalizedId) {
      return entry;
    }

    if (entry.backlinkFilter === value) {
      return entry;
    }

    updated = true;
    return {
      ...entry,
      backlinkFilter: value
    };
  });

  return { entries: nextEntries, updated };
}

export function togglePinnedExplorerCollapse(
  entries: PinnedExplorerEntryState[],
  id: string
): { entries: PinnedExplorerEntryState[]; toggled: boolean } {
  const normalizedId = normalizePinnedIdentifier(id);
  if (!normalizedId) {
    return { entries, toggled: false };
  }

  let toggled = false;
  const nextEntries = entries.map((entry) => {
    if (entry.id !== normalizedId) {
      return entry;
    }

    toggled = true;
    return {
      ...entry,
      collapsed: !entry.collapsed
    };
  });

  return { entries: nextEntries, toggled };
}

export function resetActiveExplorerForNewInstance(state: ActiveExplorerState): ActiveExplorerState {
  return {
    route: { kind: 'home' },
    backStack: [],
    forwardStack: [],
    backlinksExpanded: false,
    backlinkFilter: '',
    loadToken: state.loadToken + 1
  };
}

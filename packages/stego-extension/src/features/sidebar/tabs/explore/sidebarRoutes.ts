import type { ExplorerRoute } from '../../../../shared/types';

export function normalizeExplorerRoute(route: ExplorerRoute): ExplorerRoute | undefined {
  if (route.kind === 'home') {
    return { kind: 'home' };
  }

  if (route.kind === 'branch') {
    const key = route.key.trim();
    if (key.includes('..')) {
      return undefined;
    }

    return { kind: 'branch', key };
  }

  const id = route.id.trim().toUpperCase();
  if (!id) {
    return undefined;
  }

  return { kind: 'identifier', id };
}

export function isSameExplorerRoute(a: ExplorerRoute, b: ExplorerRoute): boolean {
  if (a.kind !== b.kind) {
    return false;
  }

  if (a.kind === 'home') {
    return true;
  }

  if (a.kind === 'branch' && b.kind === 'branch') {
    return a.key === b.key;
  }

  return a.kind === 'identifier' && b.kind === 'identifier' && a.id === b.id;
}

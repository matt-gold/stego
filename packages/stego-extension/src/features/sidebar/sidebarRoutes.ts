import type { ExplorerRoute } from '../../shared/types';

export function normalizeExplorerRoute(route: ExplorerRoute): ExplorerRoute | undefined {
  if (route.kind === 'home') {
    return { kind: 'home' };
  }

  if (route.kind === 'category') {
    const key = route.key.trim();
    const prefix = route.prefix.trim().toUpperCase();
    if (!key || !prefix) {
      return undefined;
    }

    return { kind: 'category', key, prefix };
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

  if (a.kind === 'category' && b.kind === 'category') {
    return a.key === b.key && a.prefix === b.prefix;
  }

  return a.kind === 'identifier' && b.kind === 'identifier' && a.id === b.id;
}

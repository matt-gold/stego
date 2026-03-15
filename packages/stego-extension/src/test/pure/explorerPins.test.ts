import test from 'node:test';
import assert from 'node:assert/strict';
import type { ExplorerRoute } from '../../shared/types';
import {
  EXPLORER_PIN_LIMIT,
  pinExplorerEntry,
  resetActiveExplorerForNewInstance,
  type ActiveExplorerState,
  type PinnedExplorerEntryState,
  togglePinnedExplorerCollapse,
  unpinExplorerEntry
} from '../../features/sidebar/tabs/explore/explorerPins';

test('pinExplorerEntry only allows identifier routes', () => {
  const homeRoute: ExplorerRoute = { kind: 'home' };
  const result = pinExplorerEntry([], homeRoute);

  assert.equal(result.kind, 'invalid');
  assert.deepEqual(result.entries, []);
});

test('pinExplorerEntry prevents duplicate identifiers after normalization', () => {
  const entries: PinnedExplorerEntryState[] = [
    { id: 'CHAR-JANE', backlinkFilter: '', backlinksExpanded: false, collapsed: false }
  ];

  const result = pinExplorerEntry(entries, { kind: 'identifier', id: ' char-jane ' });

  assert.equal(result.kind, 'duplicate');
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0]?.id, 'CHAR-JANE');
});

test('pinExplorerEntry enforces the pin limit', () => {
  const entries: PinnedExplorerEntryState[] = Array.from({ length: EXPLORER_PIN_LIMIT }, (_, index) => ({
    id: `LOC-${index}`,
    backlinkFilter: '',
    backlinksExpanded: false,
    collapsed: false
  }));

  const result = pinExplorerEntry(entries, { kind: 'identifier', id: 'LOC-EXTRA' });

  assert.equal(result.kind, 'limit');
  assert.equal(result.entries.length, EXPLORER_PIN_LIMIT);
});

test('unpinExplorerEntry removes only the targeted identifier', () => {
  const entries: PinnedExplorerEntryState[] = [
    { id: 'LOC-HOUSE', backlinkFilter: '', backlinksExpanded: false, collapsed: false },
    { id: 'LOC-SCHOOL', backlinkFilter: 'chapter', backlinksExpanded: true, collapsed: true }
  ];

  const result = unpinExplorerEntry(entries, 'loc-house');

  assert.equal(result.removed, true);
  assert.deepEqual(result.entries.map((entry) => entry.id), ['LOC-SCHOOL']);
  assert.equal(result.entries[0]?.backlinkFilter, 'chapter');
  assert.equal(result.entries[0]?.collapsed, true);
});

test('togglePinnedExplorerCollapse only toggles the targeted pin', () => {
  const entries: PinnedExplorerEntryState[] = [
    { id: 'LOC-HOUSE', backlinkFilter: '', backlinksExpanded: false, collapsed: false },
    { id: 'LOC-SCHOOL', backlinkFilter: '', backlinksExpanded: false, collapsed: true }
  ];

  const result = togglePinnedExplorerCollapse(entries, 'loc-house');

  assert.equal(result.toggled, true);
  assert.equal(result.entries[0]?.collapsed, true);
  assert.equal(result.entries[1]?.collapsed, true);
});

test('pin lists can be managed independently per project', () => {
  const pinsByProject = new Map<string, PinnedExplorerEntryState[]>();
  const getPins = (projectKey: string): PinnedExplorerEntryState[] => pinsByProject.get(projectKey) ?? [];
  const setPins = (projectKey: string, entries: PinnedExplorerEntryState[]): void => {
    if (entries.length === 0) {
      pinsByProject.delete(projectKey);
      return;
    }
    pinsByProject.set(projectKey, entries);
  };

  const alphaPinned = pinExplorerEntry(getPins('alpha'), { kind: 'identifier', id: 'CHAR-ALICE' });
  assert.equal(alphaPinned.kind, 'pinned');
  setPins('alpha', alphaPinned.entries);

  const betaPinned = pinExplorerEntry(getPins('beta'), { kind: 'identifier', id: 'LOC-CITY' });
  assert.equal(betaPinned.kind, 'pinned');
  setPins('beta', betaPinned.entries);

  const alphaUnpinned = unpinExplorerEntry(getPins('alpha'), 'char-alice');
  assert.equal(alphaUnpinned.removed, true);
  setPins('alpha', alphaUnpinned.entries);

  assert.deepEqual(getPins('alpha'), []);
  assert.deepEqual(getPins('beta').map((entry) => entry.id), ['LOC-CITY']);
});

test('resetActiveExplorerForNewInstance clears active explorer state after pin', () => {
  const current: ActiveExplorerState = {
    route: { kind: 'identifier', id: 'LOC-HARBOR' },
    backStack: [{ kind: 'home' }],
    forwardStack: [{ kind: 'branch', key: 'locations' }],
    backlinksExpanded: true,
    backlinkFilter: 'chapter-1',
    loadToken: 7
  };

  const next = resetActiveExplorerForNewInstance(current);

  assert.deepEqual(next.route, { kind: 'home' });
  assert.deepEqual(next.backStack, []);
  assert.deepEqual(next.forwardStack, []);
  assert.equal(next.backlinksExpanded, false);
  assert.equal(next.backlinkFilter, '');
  assert.equal(next.loadToken, 8);
});

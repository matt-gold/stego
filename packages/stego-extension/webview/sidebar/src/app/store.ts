import { createSignal } from 'solid-js';
import type { SidebarWebviewState } from '@sidebar-protocol';

const [sidebarState, setSidebarState] = createSignal<SidebarWebviewState | undefined>(undefined);

export function useSidebarState(): typeof sidebarState {
  return sidebarState;
}

export function updateSidebarState(nextState: SidebarWebviewState): void {
  // Force a new top-level identity for each host snapshot so Solid always reconciles.
  setSidebarState({ ...nextState });
}

export function resetSidebarState(): void {
  setSidebarState(undefined);
}

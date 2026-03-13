import type {
  SidebarActionMessage,
  SidebarHostMessage,
  SidebarWebviewState
} from '@sidebar-protocol';
import { getWebviewApi } from './vscodeApi';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

export function parseSidebarHostMessage(value: unknown): SidebarHostMessage<SidebarWebviewState> | undefined {
  const record = asRecord(value);
  if (!record || record.type !== 'state') {
    return undefined;
  }

  return record as SidebarHostMessage<SidebarWebviewState>;
}

export function postReadyMessage(): void {
  getWebviewApi().postMessage({ type: 'ready' });
}

export function postSidebarAction(message: SidebarActionMessage): void {
  getWebviewApi().postMessage(message);
}

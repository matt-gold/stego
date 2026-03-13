import type * as vscode from 'vscode';
import type { SidebarState } from '../../../../../shared/types';
import type { SidebarWebviewState } from '../../../protocol';
import { toSidebarWebviewState } from '../../../webview';

export function projectSidebarState(
  webview: vscode.Webview,
  state: SidebarState
): SidebarWebviewState {
  return toSidebarWebviewState(webview, state);
}

import * as vscode from 'vscode';

export type SidebarAssetUris = {
  styleUri: vscode.Uri;
  scriptUri: vscode.Uri;
};

export function getSidebarAssetUris(webview: vscode.Webview, extensionUri: vscode.Uri): SidebarAssetUris {
  return {
    styleUri: webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'sidebar', 'sidebar.css')),
    scriptUri: webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'sidebar', 'sidebar.js'))
  };
}

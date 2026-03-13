import * as vscode from 'vscode';

export type SidebarAssetUris = {
  styleUri: vscode.Uri;
  scriptUri: vscode.Uri;
};

export function getSidebarAssetUris(webview: vscode.Webview, extensionUri: vscode.Uri): SidebarAssetUris {
  return {
    styleUri: webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'out', 'webview', 'sidebar', 'sidebar-app.css')),
    scriptUri: webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'out', 'webview', 'sidebar', 'sidebar-app.js'))
  };
}

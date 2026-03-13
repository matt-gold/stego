import * as vscode from 'vscode';
import { getSidebarAssetUris } from './assetUris';
import { randomNonce } from './renderUtils';

export function renderSidebarShellHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = randomNonce();
  const assets = getSidebarAssetUris(webview, extensionUri);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource}; script-src ${webview.cspSource} 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${assets.styleUri.toString()}" />
</head>
<body>
  <div id="app"></div>
  <script type="module" nonce="${nonce}" src="${assets.scriptUri.toString()}"></script>
</body>
</html>`;
}

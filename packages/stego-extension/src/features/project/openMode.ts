import * as path from 'path';
import { promises as fs } from 'fs';
import * as vscode from 'vscode';

export type StegoOpenMode = 'workspace' | 'project' | 'unknown';

async function hasFile(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

function getFileWorkspaceRoots(): string[] {
  return (vscode.workspace.workspaceFolders ?? [])
    .map((folder) => folder.uri)
    .filter((uri) => uri.scheme === 'file')
    .map((uri) => uri.fsPath);
}

export async function getStegoWorkspaceRoots(): Promise<string[]> {
  const roots = getFileWorkspaceRoots();
  const matches: string[] = [];
  for (const root of roots) {
    if (await hasFile(path.join(root, 'stego.config.json'))) {
      matches.push(root);
    }
  }

  return matches;
}

export async function detectStegoOpenMode(): Promise<StegoOpenMode> {
  const stegoWorkspaceRoots = await getStegoWorkspaceRoots();
  if (stegoWorkspaceRoots.length > 0) {
    return 'workspace';
  }

  const roots = getFileWorkspaceRoots();
  for (const root of roots) {
    if (await hasFile(path.join(root, 'stego-project.json'))) {
      return 'project';
    }
  }

  return 'unknown';
}

export async function resolveStegoWorkspaceRoot(): Promise<string | undefined> {
  const roots = await getStegoWorkspaceRoots();
  if (roots.length === 0) {
    return undefined;
  }

  if (roots.length === 1) {
    return roots[0];
  }

  const picked = await vscode.window.showQuickPick(
    roots.map((root) => ({
      label: path.basename(root) || root,
      description: root,
      root
    })),
    {
      title: 'Select Stego Workspace',
      placeHolder: 'Multiple Stego workspaces are open. Select one.'
    }
  );

  return picked?.root;
}

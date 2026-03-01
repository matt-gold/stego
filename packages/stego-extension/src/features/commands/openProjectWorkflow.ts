import * as path from 'path';
import { promises as fs } from 'fs';
import type { Dirent, Stats } from 'fs';
import * as vscode from 'vscode';
import { resolveStegoWorkspaceRoot } from '../project/openMode';

const DEFAULT_PROJECTS_DIR = 'projects';

type WorkspaceProjectEntry = {
  id: string;
  title?: string;
  projectDir: string;
};

type ProjectQuickPickItem = vscode.QuickPickItem & {
  projectDir: string;
};

export async function runOpenProjectWorkflow(): Promise<void> {
  const workspaceRoot = await resolveStegoWorkspaceRoot();
  if (!workspaceRoot) {
    void vscode.window.showWarningMessage(
      'Open a Stego workspace root (folder with stego.config.json) to open a project.'
    );
    return;
  }

  const projects = await collectWorkspaceProjects(workspaceRoot);
  if (projects.length === 0) {
    void vscode.window.showWarningMessage('No Stego projects found in this workspace.');
    return;
  }

  const picked = await vscode.window.showQuickPick<ProjectQuickPickItem>(
    projects.map((project) => ({
      label: project.id,
      description: project.title || undefined,
      detail: project.projectDir,
      projectDir: project.projectDir
    })),
    {
      title: 'Open Stego Project',
      placeHolder: 'Select a project to open in a new window'
    }
  );
  if (!picked) {
    return;
  }

  await vscode.commands.executeCommand(
    'vscode.openFolder',
    vscode.Uri.file(picked.projectDir),
    {
      forceNewWindow: true
    }
  );
}

async function collectWorkspaceProjects(workspaceRoot: string): Promise<WorkspaceProjectEntry[]> {
  const projectsDirName = await readProjectsDir(workspaceRoot);
  const projectsRoot = path.join(workspaceRoot, projectsDirName);
  let entries: Dirent[];
  try {
    entries = await fs.readdir(projectsRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  const projects: WorkspaceProjectEntry[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const projectDir = path.join(projectsRoot, entry.name);
    const projectConfigPath = path.join(projectDir, 'stego-project.json');
    let projectConfigStat: Stats;
    try {
      projectConfigStat = await fs.stat(projectConfigPath);
    } catch {
      continue;
    }
    if (!projectConfigStat.isFile()) {
      continue;
    }

    const title = await readProjectTitle(projectConfigPath);
    projects.push({
      id: entry.name,
      title,
      projectDir
    });
  }

  return projects.sort((a, b) => a.id.localeCompare(b.id));
}

async function readProjectTitle(projectConfigPath: string): Promise<string | undefined> {
  try {
    const raw = await fs.readFile(projectConfigPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return undefined;
    }

    const title = (parsed as Record<string, unknown>).title;
    if (typeof title !== 'string') {
      return undefined;
    }

    const trimmed = title.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

async function readProjectsDir(workspaceRoot: string): Promise<string> {
  const configPath = path.join(workspaceRoot, 'stego.config.json');
  try {
    const raw = await fs.readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return DEFAULT_PROJECTS_DIR;
    }

    const rawProjectsDir = (parsed as Record<string, unknown>).projectsDir;
    if (typeof rawProjectsDir !== 'string') {
      return DEFAULT_PROJECTS_DIR;
    }

    const projectsDir = rawProjectsDir.trim();
    return projectsDir.length > 0 ? projectsDir : DEFAULT_PROJECTS_DIR;
  } catch {
    return DEFAULT_PROJECTS_DIR;
  }
}

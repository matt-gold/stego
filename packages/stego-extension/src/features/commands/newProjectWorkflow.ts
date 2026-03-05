import * as path from 'path';
import { promises as fs } from 'fs';
import * as vscode from 'vscode';
import { errorToMessage } from '../../shared/errors';
import type { ScriptRunResult } from '../../shared/types';
import { pickToastDetails, resolveWorkspaceCommandInvocation, runCommand } from './workflowUtils';
import type { WorkflowRunResult } from './workflowUtils';
import { resolveStegoWorkspaceRoot } from '../project/openMode';
import { isValidProjectId } from '../../../../shared/src/domain/project';

const DEFAULT_PROJECTS_DIR = 'projects';

type ProseFontOption = vscode.QuickPickItem & { enableProseFont: boolean };

export async function runNewProjectWorkflow(): Promise<WorkflowRunResult> {
  const workspaceRoot = await resolveStegoWorkspaceRoot();
  if (!workspaceRoot) {
    void vscode.window.showWarningMessage(
      'Open a Stego workspace root (folder with stego.config.json) to create a new project.'
    );
    return { ok: false, cancelled: true };
  }

  const projectId = await promptProjectId();
  if (!projectId) {
    return { ok: false, cancelled: true };
  }

  const proseFontChoice = await promptProseFontChoice();
  if (proseFontChoice === undefined) {
    return { ok: false, cancelled: true };
  }

  const invocation = await resolveWorkspaceCommandInvocation(
    workspaceRoot,
    {
      scriptName: 'new-project',
      scriptArgs: ['--project', projectId, '--prose-font', proseFontChoice ? 'yes' : 'no'],
      stegoArgs: ['new-project', '--project', projectId, '--prose-font', proseFontChoice ? 'yes' : 'no'],
      actionLabel: 'Create New Stego Project'
    }
  );
  if (!invocation) {
    return { ok: false, cancelled: true };
  }

  let result: ScriptRunResult;
  try {
    result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Create New Stego Project (${projectId})`,
        cancellable: false
      },
      async () => runCommand(invocation.command, invocation.args, workspaceRoot)
    );
  } catch (error) {
    const message = errorToMessage(error);
    void vscode.window.showErrorMessage(`Create New Stego Project failed: ${message}`);
    return { ok: false, error: message };
  }

  if (result.exitCode !== 0) {
    const details = pickToastDetails(result);
    void vscode.window.showErrorMessage(details
      ? `Create New Stego Project failed: ${details}`
      : `Create New Stego Project failed with exit code ${result.exitCode}.`);
    return { ok: false, error: details || `Exit code ${result.exitCode}` };
  }

  const projectsDir = await readProjectsDir(workspaceRoot);
  const projectDir = path.join(workspaceRoot, projectsDir, projectId);

  const action = await vscode.window.showInformationMessage(
    proseFontChoice
      ? `Created Stego project '${projectId}'.`
      : `Created Stego project '${projectId}' (without prose font settings).`,
    'Open Config'
  );
  if (action === 'Open Config') {
    const configPath = path.join(projectDir, 'stego-project.json');
    try {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(configPath));
      await vscode.window.showTextDocument(document, { preview: false });
    } catch {
      // no-op
    }
  }

  return {
    ok: true,
    projectDir
  };
}

async function promptProjectId(): Promise<string | undefined> {
  const value = await vscode.window.showInputBox({
    title: 'New Stego Project',
    prompt: 'Project id',
    placeHolder: 'my-book',
    ignoreFocusOut: true,
    validateInput: (rawValue) => {
      const candidate = rawValue.trim();
      if (!candidate) {
        return 'Project id is required.';
      }
      if (!isValidProjectId(candidate)) {
        return 'Project id must match /^[a-z0-9][a-z0-9-]*$/.';
      }
      return undefined;
    }
  });

  const projectId = value?.trim();
  if (!projectId) {
    return undefined;
  }

  return projectId;
}

async function promptProseFontChoice(): Promise<boolean | undefined> {
  const picked = await vscode.window.showQuickPick<ProseFontOption>(
    [
      {
        label: 'Yes',
        description: 'Enable proportional (prose-style) Markdown font (recommended)',
        enableProseFont: true
      },
      {
        label: 'No',
        description: 'Keep default VS Code font settings',
        enableProseFont: false
      }
    ],
    {
      title: 'New Stego Project',
      placeHolder: 'Switch project to proportional (prose-style) font?'
    }
  );

  return picked?.enableProseFont;
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

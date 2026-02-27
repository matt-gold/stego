import * as path from 'path';
import { promises as fs } from 'fs';
import * as vscode from 'vscode';
import { errorToMessage } from '../../shared/errors';
import type { ScriptRunResult } from '../../shared/types';
import { pickToastDetails, resolveProjectScriptContext, resolveWorkflowCommandInvocation, runCommand } from './workflowUtils';
import type { WorkflowRunResult } from './workflowUtils';

export async function runNewManuscriptWorkflow(): Promise<WorkflowRunResult> {
  const context = await resolveProjectScriptContext();
  if (!context) {
    return { ok: false, cancelled: true };
  }

  const manuscriptFilesBefore = await listManuscriptFiles(context.projectDir);
  const invocation = await resolveWorkflowCommandInvocation(context, {
    scriptName: 'new',
    stegoArgs: ['new', '--project', context.projectId],
    actionLabel: 'Create New Manuscript'
  });
  if (!invocation) {
    return { ok: false, cancelled: true, projectDir: context.projectDir };
  }

  let result: ScriptRunResult;

  try {
    result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Create New Manuscript',
        cancellable: false
      },
      async () => runCommand(invocation.command, invocation.args, context.projectDir)
    );
  } catch (error) {
    void vscode.window.showErrorMessage(`Create New Manuscript failed: ${errorToMessage(error)}`);
    return {
      ok: false,
      error: errorToMessage(error),
      projectDir: context.projectDir
    };
  }

  if (result.exitCode !== 0) {
    const details = pickToastDetails(result);
    void vscode.window.showErrorMessage(details
      ? `Create New Manuscript failed: ${details}`
      : `Create New Manuscript failed with exit code ${result.exitCode}.`);
    return {
      ok: false,
      error: details || `Exit code ${result.exitCode}`,
      projectDir: context.projectDir
    };
  }

  const createdPath = extractCreatedManuscriptPath(result);
  const openedPath = await tryOpenCreatedPath(createdPath, context.document.uri, context.projectDir);
  if (!openedPath) {
    const inferredPath = await detectCreatedManuscriptPath(context.projectDir, manuscriptFilesBefore);
    if (inferredPath) {
      const inferredDocument = await vscode.workspace.openTextDocument(vscode.Uri.file(inferredPath));
      await vscode.window.showTextDocument(inferredDocument, { preview: false });
      void vscode.window.showInformationMessage(`Created manuscript: ${inferredPath}`);
      return {
        ok: true,
        outputPath: inferredPath,
        projectDir: context.projectDir
      };
    }
  }

  if (openedPath) {
    void vscode.window.showInformationMessage(`Created manuscript: ${openedPath}`);
    return {
      ok: true,
      outputPath: openedPath,
      projectDir: context.projectDir
    };
  }

  void vscode.window.showInformationMessage(createdPath
    ? `Created manuscript: ${createdPath}`
    : 'Created manuscript.');

  return {
    ok: true,
    outputPath: createdPath,
    projectDir: context.projectDir
  };
}

function extractCreatedManuscriptPath(result: ScriptRunResult): string | undefined {
  const text = `${result.stdout}\n${result.stderr}`.trim();
  if (!text) {
    return undefined;
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    const match = line.match(/Created manuscript:\s*(.+)$/i);
    if (!match) {
      continue;
    }

    const candidate = match[1].trim().replace(/^['\"]|['\"]$/g, '');
    if (candidate) {
      return candidate;
    }
  }

  return undefined;
}

async function tryOpenCreatedPath(
  rawPath: string | undefined,
  scopeUri: vscode.Uri,
  projectDir: string
): Promise<string | undefined> {
  if (!rawPath) {
    return undefined;
  }

  const candidates = await resolveCreatedPathCandidates(rawPath, scopeUri, projectDir);

  for (const filePath of candidates) {
    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) {
        continue;
      }

      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
      await vscode.window.showTextDocument(document, { preview: false });
      return filePath;
    } catch {
      // no-op
    }
  }

  return undefined;
}

async function resolveCreatedPathCandidates(
  rawPath: string,
  scopeUri: vscode.Uri,
  projectDir: string
): Promise<string[]> {
  const normalizedRaw = rawPath.trim();
  if (!normalizedRaw) {
    return [];
  }

  if (path.isAbsolute(normalizedRaw)) {
    return [path.resolve(normalizedRaw)];
  }

  const folder = vscode.workspace.getWorkspaceFolder(scopeUri);
  const cwd = folder?.uri.fsPath;
  const editorPath = scopeUri.scheme === 'file' ? path.dirname(scopeUri.fsPath) : undefined;
  const stegoWorkspaceRoot = await findNearestStegoWorkspaceRoot(projectDir);

  const candidates = new Set<string>();
  candidates.add(path.resolve(path.join(projectDir, normalizedRaw)));
  if (cwd) {
    candidates.add(path.resolve(path.join(cwd, normalizedRaw)));
  }
  if (editorPath) {
    candidates.add(path.resolve(path.join(editorPath, normalizedRaw)));
  }
  if (stegoWorkspaceRoot) {
    candidates.add(path.resolve(path.join(stegoWorkspaceRoot, normalizedRaw)));
  }
  for (const workspaceFolder of vscode.workspace.workspaceFolders ?? []) {
    candidates.add(path.resolve(path.join(workspaceFolder.uri.fsPath, normalizedRaw)));
  }

  return [...candidates];
}

async function listManuscriptFiles(projectDir: string): Promise<Set<string>> {
  const manuscriptDir = path.join(projectDir, 'manuscripts');
  let entries: string[];
  try {
    entries = await fs.readdir(manuscriptDir);
  } catch {
    return new Set();
  }

  return new Set(
    entries
      .filter((name) => name.toLowerCase().endsWith('.md'))
      .map((name) => path.resolve(path.join(manuscriptDir, name)))
  );
}

async function detectCreatedManuscriptPath(
  projectDir: string,
  manuscriptFilesBefore: Set<string>
): Promise<string | undefined> {
  const manuscriptFilesAfter = await listManuscriptFiles(projectDir);
  const created = [...manuscriptFilesAfter].filter((filePath) => !manuscriptFilesBefore.has(filePath));
  if (created.length > 0) {
    created.sort((a, b) => a.localeCompare(b));
    return created[created.length - 1];
  }

  return undefined;
}

async function findNearestStegoWorkspaceRoot(startDir: string): Promise<string | undefined> {
  let current = path.resolve(startDir);

  while (true) {
    const candidate = path.join(current, 'stego.config.json');
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) {
        return current;
      }
    } catch {
      // no-op
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }

    current = parent;
  }
}

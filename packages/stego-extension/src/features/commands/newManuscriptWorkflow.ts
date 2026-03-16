import * as path from 'path';
import { promises as fs } from 'fs';
import * as vscode from 'vscode';
import { errorToMessage } from '../../shared/errors';
import { CONTENT_DIR } from '../../shared/constants';
import type { ScriptRunResult } from '../../shared/types';
import { pickToastDetails, resolveProjectScriptContext, resolveWorkflowCommandInvocation, runCommand } from './workflowUtils';
import type { WorkflowRunResult } from './workflowUtils';
import { suppressAutoFoldFrontmatterForDocument } from './frontmatterFold';

const DEFAULT_NEW_LEAF_SLUG = 'new-leaf';
const DEFAULT_MANUSCRIPT_BRANCH_DIR = 'manuscript';

type LeafOrderEntry = {
  order: number;
  filename: string;
};

export async function runNewManuscriptWorkflow(): Promise<WorkflowRunResult> {
  const context = await resolveProjectScriptContext({ requireMarkdown: false });
  if (!context) {
    return { ok: false, cancelled: true };
  }

  const targetDir = await resolveTargetLeafDir(context.projectDir, context.document.uri.fsPath);
  const contentRoot = path.join(context.projectDir, CONTENT_DIR);
  const targetDirRelative = toContentRelativeDir(contentRoot, targetDir);
  const existingLeafFiles = await listLeafFiles(targetDir);
  const defaultFilename = await inferDefaultLeafFilename(targetDir);
  const requestedFilename = await promptRequestedFilename(defaultFilename);
  if (requestedFilename === undefined) {
    return { ok: false, cancelled: true, projectDir: context.projectDir };
  }
  const normalizedRequestedFilename = requestedFilename
    ? normalizeRequestedFilename(requestedFilename)
    : '';

  const scriptArgs = normalizedRequestedFilename ? ['--filename', normalizedRequestedFilename] : [];
  if (targetDirRelative) {
    scriptArgs.push('--dir', targetDirRelative);
  }
  scriptArgs.push('--format', 'json');
  const stegoArgs = ['new', '--project', context.projectId];
  if (normalizedRequestedFilename) {
    stegoArgs.push('--filename', normalizedRequestedFilename);
  }
  if (targetDirRelative) {
    stegoArgs.push('--dir', targetDirRelative);
  }
  stegoArgs.push('--format', 'json');

  const invocation = await resolveWorkflowCommandInvocation(context, {
    scriptName: 'new',
    scriptArgs,
    stegoArgs,
    actionLabel: 'Create New Leaf'
  });
  if (!invocation) {
    return { ok: false, cancelled: true, projectDir: context.projectDir };
  }

  let result: ScriptRunResult;

  try {
    result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Create New Leaf',
        cancellable: false
      },
      async () => runCommand(invocation.command, invocation.args, context.projectDir)
    );
  } catch (error) {
    void vscode.window.showErrorMessage(`Create New Leaf failed: ${errorToMessage(error)}`);
    return {
      ok: false,
      error: errorToMessage(error),
      projectDir: context.projectDir
    };
  }

  if (result.exitCode !== 0) {
    const details = pickToastDetails(result);
    void vscode.window.showErrorMessage(details
      ? `Create New Leaf failed: ${details}`
      : `Create New Leaf failed with exit code ${result.exitCode}.`);
    return {
      ok: false,
      error: details || `Exit code ${result.exitCode}`,
      projectDir: context.projectDir
    };
  }

  const createdPath = extractCreatedLeafPath(result);
  const resolvedPath = await resolveCreatedLeafPath(
    createdPath,
    context.document.uri,
    context.projectDir,
    targetDir,
    existingLeafFiles
  );
  const finalPath = resolvedPath;

  if (finalPath) {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(finalPath));
    suppressAutoFoldFrontmatterForDocument(document.uri);
    await vscode.window.showTextDocument(document, { preview: false });
    void vscode.window.showInformationMessage(`Created leaf: ${finalPath}`);
    return {
      ok: true,
      outputPath: finalPath,
      projectDir: context.projectDir
    };
  }

  void vscode.window.showInformationMessage(createdPath
    ? `Created leaf: ${createdPath}`
    : 'Created leaf.');

  return {
    ok: true,
    outputPath: createdPath,
    projectDir: context.projectDir
  };
}

function normalizeRequestedFilename(rawFilename: string): string {
  const trimmed = rawFilename.trim();
  return trimmed.toLowerCase().endsWith('.md')
    ? trimmed
    : `${trimmed}.md`;
}

async function promptRequestedFilename(defaultFilename: string): Promise<string | undefined> {
  const rawValue = await vscode.window.showInputBox({
    title: 'Create New Leaf',
    prompt: `Optional filename. Press Enter to use inferred default: ${defaultFilename}`,
    placeHolder: defaultFilename,
    value: '',
    ignoreFocusOut: true,
    validateInput: (value) => {
      const trimmed = value.trim();
      if (!trimmed) {
        return undefined;
      }
      if (/[\\/]/.test(trimmed)) {
        return 'Use a filename only (no directory separators).';
      }
      if (trimmed === '.md') {
        return 'Enter a filename before .md.';
      }
      return undefined;
    }
  });

  if (rawValue === undefined) {
    return undefined;
  }

  const trimmed = rawValue.trim();
  return trimmed || '';
}

function extractCreatedLeafPath(result: ScriptRunResult): string | undefined {
  const text = `${result.stdout}\n${result.stderr}`.trim();
  if (!text) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(result.stdout.trim()) as {
      ok?: boolean;
      operation?: string;
      result?: { filePath?: string };
    };
    if (parsed?.ok && parsed.operation === 'new' && typeof parsed.result?.filePath === 'string') {
      return parsed.result.filePath;
    }
  } catch {
    // fall through to text-output parsing
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    const match = line.match(/Created (?:manuscript|leaf):\s*(.+)$/i);
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

async function resolveCreatedLeafPath(
  rawPath: string | undefined,
  scopeUri: vscode.Uri,
  projectDir: string,
  targetDir: string,
  leafFilesBefore: Set<string>
): Promise<string | undefined> {
  const resolvedFromOutput = await resolveCreatedPath(rawPath, scopeUri, projectDir);
  if (resolvedFromOutput) {
    return resolvedFromOutput;
  }

  return detectCreatedLeafPath(targetDir, leafFilesBefore);
}

async function resolveCreatedPath(
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

async function listLeafFiles(dirPath: string): Promise<Set<string>> {
  let entries: string[];
  try {
    entries = await fs.readdir(dirPath);
  } catch {
    return new Set();
  }

  return new Set(
    entries
      .filter((name) => name.toLowerCase().endsWith('.md'))
      .map((name) => path.resolve(path.join(dirPath, name)))
  );
}

async function listLeafOrderEntries(dirPath: string): Promise<LeafOrderEntry[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(dirPath);
  } catch {
    return [];
  }

  return entries
    .filter((name) => name.toLowerCase().endsWith('.md'))
    .map((name) => {
      const match = name.match(/^(\d+)[-_]/);
      if (!match) {
        return null;
      }
      return {
        order: Number(match[1]),
        filename: name
      };
    })
    .filter((entry): entry is LeafOrderEntry => !!entry)
    .sort((a, b) => {
      if (a.order === b.order) {
        return a.filename.localeCompare(b.filename);
      }
      return a.order - b.order;
    });
}

function inferNextLeafPrefix(entries: LeafOrderEntry[]): number {
  if (entries.length === 0) {
    return 100;
  }

  if (entries.length === 1) {
    return entries[0].order + 100;
  }

  const previous = entries[entries.length - 2].order;
  const latest = entries[entries.length - 1].order;
  const step = latest - previous;
  return latest + (step > 0 ? step : 1);
}

async function inferDefaultLeafFilename(targetDir: string): Promise<string> {
  const entries = await listLeafOrderEntries(targetDir);
  const nextPrefix = inferNextLeafPrefix(entries);
  return `${nextPrefix}-${DEFAULT_NEW_LEAF_SLUG}.md`;
}

async function resolveTargetLeafDir(projectDir: string, activeFilePath: string): Promise<string> {
  const contentRoot = path.join(projectDir, CONTENT_DIR);
  const normalizedActiveFilePath = path.resolve(activeFilePath);
  const relativeToContent = path.relative(contentRoot, normalizedActiveFilePath);
  if (!relativeToContent.startsWith('..') && !path.isAbsolute(relativeToContent)) {
    return path.dirname(normalizedActiveFilePath);
  }

  const manuscriptDir = path.join(contentRoot, DEFAULT_MANUSCRIPT_BRANCH_DIR);
  if (await isDirectory(manuscriptDir)) {
    return manuscriptDir;
  }

  return contentRoot;
}

function toContentRelativeDir(contentRoot: string, targetDir: string): string | undefined {
  const relative = path.relative(contentRoot, targetDir);
  if (!relative || relative === '.') {
    return undefined;
  }
  return relative.split(path.sep).join('/');
}

async function detectCreatedLeafPath(
  targetDir: string,
  leafFilesBefore: Set<string>
): Promise<string | undefined> {
  const leafFilesAfter = await listLeafFiles(targetDir);
  const created = [...leafFilesAfter].filter((filePath) => !leafFilesBefore.has(filePath));
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

async function isDirectory(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

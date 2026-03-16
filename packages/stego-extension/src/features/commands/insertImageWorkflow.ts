import * as path from 'path';
import * as vscode from 'vscode';
import { errorToMessage } from '../../shared/errors';
import type { WorkflowRunResult } from './workflowUtils';
import { resolveProjectScriptContext } from './workflowUtils';

const IMAGE_EXTENSION_FILTERS = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'bmp',
  'tif',
  'tiff',
  'avif'
];

export async function runInsertImageWorkflow(): Promise<WorkflowRunResult> {
  const context = await resolveProjectScriptContext({ requireMarkdown: true });
  if (!context) {
    return { ok: false, cancelled: true };
  }

  try {
    const selected = await vscode.window.showOpenDialog({
      title: 'Insert Image',
      openLabel: 'Select Image',
      canSelectMany: false,
      canSelectFiles: true,
      canSelectFolders: false,
      filters: {
        Images: IMAGE_EXTENSION_FILTERS
      }
    });
    if (!selected || selected.length === 0) {
      return { ok: false, cancelled: true, projectDir: context.projectDir };
    }

    const sourceUri = selected[0];
    const sourceName = path.basename(sourceUri.fsPath);
    const targetName = await promptTargetFilename(sourceName);
    if (targetName === undefined) {
      return { ok: false, cancelled: true, projectDir: context.projectDir };
    }

    const assetsDir = path.join(context.projectDir, 'assets');
    const destinationUri = vscode.Uri.file(path.join(assetsDir, targetName));

    await assertFileMissing(destinationUri);
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(assetsDir));
    await vscode.workspace.fs.copy(sourceUri, destinationUri, { overwrite: false });

    const editor = await ensureEditorForDocument(context.document);
    if (!editor) {
      return {
        ok: false,
        projectDir: context.projectDir,
        error: 'No active markdown editor available.'
      };
    }

    const markdownPath = toMarkdownPath(path.relative(path.dirname(context.document.uri.fsPath), destinationUri.fsPath));
    const altText = escapeMarkdownAltText(buildAltText(targetName));
    const snippet = `![${altText}](${markdownPath})`;
    const inserted = await editor.edit((builder) => {
      builder.insert(editor.selection.active, snippet);
    });
    if (!inserted) {
      throw new Error('Could not insert markdown image link into the active document.');
    }

    void vscode.window.showInformationMessage(`Inserted image: ${markdownPath}`);
    return {
      ok: true,
      outputPath: destinationUri.fsPath,
      projectDir: context.projectDir
    };
  } catch (error) {
    const message = errorToMessage(error);
    void vscode.window.showErrorMessage(`Insert Image failed: ${message}`);
    return {
      ok: false,
      error: message,
      projectDir: context.projectDir
    };
  }
}

async function promptTargetFilename(sourceName: string): Promise<string | undefined> {
  const originalExt = path.extname(sourceName);
  const originalBase = path.basename(sourceName, originalExt);

  const rawValue = await vscode.window.showInputBox({
    title: 'Insert Image',
    prompt: `Rename image for assets/ (press Enter to keep '${sourceName}')`,
    placeHolder: sourceName,
    value: sourceName,
    ignoreFocusOut: true,
    validateInput: (value) => validateTargetFilename(value, sourceName)
  });
  if (rawValue === undefined) {
    return undefined;
  }

  const trimmed = rawValue.trim();
  if (!trimmed) {
    return sourceName;
  }

  if (trimmed === originalBase && originalExt) {
    return `${trimmed}${originalExt}`;
  }

  if (!path.extname(trimmed) && originalExt) {
    return `${trimmed}${originalExt}`;
  }

  return trimmed;
}

function validateTargetFilename(rawValue: string, sourceName: string): string | undefined {
  const trimmed = rawValue.trim();
  const candidate = trimmed || sourceName;
  if (!candidate) {
    return 'Enter a filename.';
  }
  if (candidate === '.' || candidate === '..') {
    return 'Enter a valid filename.';
  }
  if (/[\\/]/.test(candidate)) {
    return 'Use a filename only (no directory separators).';
  }
  return undefined;
}

async function assertFileMissing(fileUri: vscode.Uri): Promise<void> {
  try {
    await vscode.workspace.fs.stat(fileUri);
    throw new Error(
      `Image already exists at assets/${path.basename(fileUri.fsPath)}. Rename it or choose a different filename.`
    );
  } catch (error) {
    if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
      return;
    }
    throw error;
  }
}

async function ensureEditorForDocument(document: vscode.TextDocument): Promise<vscode.TextEditor | undefined> {
  const active = vscode.window.activeTextEditor;
  if (active && active.document.uri.toString() === document.uri.toString()) {
    return active;
  }
  return vscode.window.showTextDocument(document, { preview: false });
}

function buildAltText(filename: string): string {
  const stem = path.basename(filename, path.extname(filename)).trim();
  if (!stem) {
    return 'Image';
  }
  return stem.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function escapeMarkdownAltText(value: string): string {
  return value.replace(/\[/g, '\\[').replace(/]/g, '\\]');
}

function toMarkdownPath(rawRelativePath: string): string {
  const relative = rawRelativePath.split(path.sep).join('/');
  const normalizedRelative = relative.startsWith('.') ? relative : `./${relative}`;

  return normalizedRelative
    .split('/')
    .map((segment) => {
      if (segment === '.' || segment === '..' || segment.length === 0) {
        return segment;
      }
      return encodeURIComponent(segment);
    })
    .join('/');
}

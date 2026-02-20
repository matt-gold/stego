import * as vscode from 'vscode';
import { errorToMessage } from '../../shared/errors';
import type { ScriptRunResult } from '../../shared/types';
import {
  extractOutputPath,
  pickToastDetails,
  resolveProjectScriptContext,
  runCommand
} from './workflowUtils';

export async function showBuildSuccessToast(result: ScriptRunResult, formatLabel: string): Promise<void> {
  const outputPath = extractOutputPath(result);
  if (!outputPath) {
    void vscode.window.showInformationMessage(`Build succeeded (${formatLabel}).`);
    return;
  }

  const action = await vscode.window.showInformationMessage(
    ['Build succeeded.', `Format: ${formatLabel}`, `Output: ${outputPath}`].join('\n'),
    'Open'
  );

  if (action !== 'Open') {
    return;
  }

  try {
    await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(outputPath));
  } catch (error) {
    void vscode.window.showErrorMessage(`Could not open output file: ${errorToMessage(error)}`);
  }
}

export async function runProjectBuildWorkflow(): Promise<void> {
  const context = await resolveProjectScriptContext(['build', 'export']);
  if (!context) {
    return;
  }

  const pickedFormat = await vscode.window.showQuickPick(
    [
      {
        label: 'Markdown (.md)',
        description: 'Compile manuscript markdown',
        format: 'md' as const
      },
      {
        label: 'Word (.docx)',
        description: 'Export Word document',
        format: 'docx' as const
      },
      {
        label: 'PDF (.pdf)',
        description: 'Export printable PDF (requires PDF engine)',
        format: 'pdf' as const
      },
      {
        label: 'EPUB (.epub)',
        description: 'Export EPUB ebook',
        format: 'epub' as const
      }
    ],
    {
      title: 'Build',
      placeHolder: 'Select document type'
    }
  );

  if (!pickedFormat) {
    return;
  }

  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const formatLabel = pickedFormat.label;
  const runArgs = pickedFormat.format === 'md'
    ? ['run', 'build']
    : ['run', 'export', '--', '--format', pickedFormat.format];
  let result: ScriptRunResult;
  try {
    result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Build (${formatLabel})`,
        cancellable: false
      },
      async () => runCommand(npmCommand, runArgs, context.projectDir)
    );
  } catch (error) {
    void vscode.window.showErrorMessage(`Build failed: ${errorToMessage(error)}`);
    return;
  }

  if (result.exitCode === 0) {
    await showBuildSuccessToast(result, formatLabel);
    return;
  }

  const details = pickToastDetails(result);
  void vscode.window.showErrorMessage(details
    ? `Build failed: ${details}`
    : `Build failed with exit code ${result.exitCode}.`);
}

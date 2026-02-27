import * as vscode from 'vscode';
import { errorToMessage } from '../../shared/errors';
import type { ScriptRunResult } from '../../shared/types';
import {
  extractOutputPath,
  pickToastDetails,
  resolveWorkflowCommandInvocation,
  resolveProjectScriptContext,
  runCommand
} from './workflowUtils';
import type { WorkflowRunResult } from './workflowUtils';

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

export async function runProjectBuildWorkflow(): Promise<WorkflowRunResult> {
  const context = await resolveProjectScriptContext();
  if (!context) {
    return { ok: false, cancelled: true };
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
    return { ok: false, cancelled: true, projectDir: context.projectDir };
  }

  const formatLabel = pickedFormat.label;
  const invocation = await resolveWorkflowCommandInvocation(context, {
    scriptName: pickedFormat.format === 'md' ? 'build' : 'export',
    scriptArgs: pickedFormat.format === 'md' ? [] : ['--format', pickedFormat.format],
    stegoArgs: pickedFormat.format === 'md'
      ? ['build', '--project', context.projectId]
      : ['export', '--project', context.projectId, '--format', pickedFormat.format],
    actionLabel: 'Build'
  });
  if (!invocation) {
    return { ok: false, cancelled: true, projectDir: context.projectDir };
  }

  let result: ScriptRunResult;
  try {
    result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Build (${formatLabel})`,
        cancellable: false
      },
      async () => runCommand(invocation.command, invocation.args, context.projectDir)
    );
  } catch (error) {
    void vscode.window.showErrorMessage(`Build failed: ${errorToMessage(error)}`);
    return {
      ok: false,
      error: errorToMessage(error),
      projectDir: context.projectDir
    };
  }

  if (result.exitCode === 0) {
    const outputPath = extractOutputPath(result);
    void showBuildSuccessToast(result, formatLabel);
    return { ok: true, outputPath, projectDir: context.projectDir };
  }

  const details = pickToastDetails(result);
  void vscode.window.showErrorMessage(details
    ? `Build failed: ${details}`
    : `Build failed with exit code ${result.exitCode}.`);
  return {
    ok: false,
    error: details || `Exit code ${result.exitCode}`,
    projectDir: context.projectDir
  };
}

import * as vscode from 'vscode';
import type { ExportTarget } from '@stego-labs/shared/domain/templates';
import { errorToMessage } from '../../shared/errors';
import type { ProjectTemplate, ScriptRunResult } from '../../shared/types';
import { resolveBuildTemplateChoices } from './buildWorkflowModel';
import {
  extractOutputPath,
  pickToastDetails,
  resolveWorkflowCommandInvocation,
  resolveProjectScriptContext,
  runCommand
} from './workflowUtils';
import type { WorkflowRunResult } from './workflowUtils';

type TemplateQuickPickItem = vscode.QuickPickItem & {
  template: ProjectTemplate;
  targets: readonly ExportTarget[];
};

type TargetQuickPickItem = vscode.QuickPickItem & {
  format: ExportTarget;
};

function toDisplayName(value: string): string {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

function buildTemplateQuickPickItems(templates: readonly ProjectTemplate[]): TemplateQuickPickItem[] {
  const choices = resolveBuildTemplateChoices(templates);
  return choices.flatMap((choice) => {
    const template = templates.find((entry) => entry.relativePath === choice.relativePath);
    if (!template) {
      return [];
    }

    return [{
      label: toDisplayName(choice.name),
      description: choice.targets.map((target) => target.toUpperCase()).join(', '),
      detail: choice.relativePath,
      template,
      targets: choice.targets
    }];
  });
}

function buildTargetQuickPickItems(targets: readonly ExportTarget[]): TargetQuickPickItem[] {
  return targets.map((format) => ({
    label: formatTargetLabel(format),
    description: formatTargetDescription(format),
    format
  }));
}

function formatTargetLabel(format: ExportTarget): string {
  switch (format) {
    case 'md':
      return 'Markdown (.md)';
    case 'docx':
      return 'Word (.docx)';
    case 'pdf':
      return 'PDF (.pdf)';
    case 'epub':
      return 'EPUB (.epub)';
    case 'latex':
      return 'LaTeX (.tex)';
  }
}

function formatTargetDescription(format: ExportTarget): string {
  switch (format) {
    case 'md':
      return 'Compile manuscript markdown';
    case 'docx':
      return 'Export Word document';
    case 'pdf':
      return 'Export printable PDF (requires PDF engine)';
    case 'epub':
      return 'Export EPUB ebook';
    case 'latex':
      return 'Export LaTeX source';
  }
}

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
  const context = await resolveProjectScriptContext({ requireMarkdown: false });
  if (!context) {
    return { ok: false, cancelled: true };
  }

  const templateItems = buildTemplateQuickPickItems(context.project.templates);
  if (templateItems.length === 0) {
    void vscode.window.showWarningMessage('No exportable templates were found in this project.');
    return { ok: false, cancelled: true, projectDir: context.projectDir };
  }

  const pickedTemplate = await vscode.window.showQuickPick(templateItems, {
    title: 'Compile Full Manuscript',
    placeHolder: 'Select template'
  });

  if (!pickedTemplate) {
    return { ok: false, cancelled: true, projectDir: context.projectDir };
  }

  const targetItems = buildTargetQuickPickItems(pickedTemplate.targets);
  const pickedFormat = targetItems.length > 1
    ? await vscode.window.showQuickPick(targetItems, {
      title: 'Compile Full Manuscript',
      placeHolder: `Select target for ${pickedTemplate.label}`
    })
    : targetItems[0];

  if (!pickedFormat) {
    return { ok: false, cancelled: true, projectDir: context.projectDir };
  }

  const formatLabel = pickedFormat.label;
  const invocation = await resolveWorkflowCommandInvocation(context, {
    scriptName: 'export',
    scriptArgs: ['--template', pickedTemplate.template.relativePath, '--format', pickedFormat.format],
    stegoArgs: ['export', '--project', context.projectId, '--template', pickedTemplate.template.relativePath, '--format', pickedFormat.format],
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
        title: `Build (${pickedTemplate.label} -> ${formatLabel})`,
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

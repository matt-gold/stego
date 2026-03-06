import * as vscode from 'vscode';
import { errorToMessage } from '../../shared/errors';
import { asString } from '../../shared/value';
import type { ScriptRunResult } from '../../shared/types';
import { parseMarkdownDocument, resolveAllowedStatuses } from '../metadata';
import { pickToastDetails, resolveProjectScriptContext, resolveWorkflowCommandInvocation, runCommand } from './workflowUtils';
import type { WorkflowRunResult } from './workflowUtils';

export function getStageCheckDetails(stage: string, scope: 'file' | 'project'): string[] {
  const normalizedStage = stage.trim().toLowerCase();
  const target = scope === 'file' ? 'current file' : 'project';
  const details = [
    `Ran stage gate for ${target} (${normalizedStage}).`,
    `Checked minimum status requirement (${normalizedStage}).`
  ];

  switch (normalizedStage) {
    case 'revise':
      details.push('Checked spine continuity.');
      break;
    case 'line-edit':
      details.push('Checked spine continuity.');
      details.push('Ran spell check.');
      break;
    case 'proof':
    case 'final':
      details.push('Checked spine continuity.');
      details.push('Ran markdown lint.');
      details.push('Ran spell check.');
      details.push('Enforced strict local link checks.');
      break;
    case 'draft':
    default:
      break;
  }

  return details;
}

export async function runProjectGateStageWorkflow(): Promise<WorkflowRunResult> {
  const context = await resolveProjectScriptContext();
  if (!context) {
    return { ok: false, cancelled: true };
  }

  const allowedStatuses = await resolveAllowedStatuses(context.document);
  if (allowedStatuses.length === 0) {
    void vscode.window.showWarningMessage('No allowed statuses configured for stage gating.');
    return { ok: false, cancelled: true, projectDir: context.projectDir };
  }

  let currentStatus: string | undefined;
  try {
    const parsed = parseMarkdownDocument(context.document.getText());
    currentStatus = asString(parsed.frontmatter.status)?.toLowerCase();
  } catch {
    currentStatus = undefined;
  }

  const pickedStage = await vscode.window.showQuickPick(
    allowedStatuses.map((status) => ({
      label: status,
      description: currentStatus === status ? 'Current file status' : undefined
    })),
    {
      title: 'Run Stage Checks',
      placeHolder: 'Select stage to check across the project'
    }
  );

  if (!pickedStage) {
    return { ok: false, cancelled: true, projectDir: context.projectDir };
  }

  const stage = pickedStage.label;
  const invocation = await resolveWorkflowCommandInvocation(context, {
    scriptName: 'check-stage',
    scriptArgs: ['--stage', stage],
    stegoArgs: ['check-stage', '--project', context.projectId, '--stage', stage],
    actionLabel: 'Run Stage Checks'
  });
  if (!invocation) {
    return { ok: false, cancelled: true, projectDir: context.projectDir, stage };
  }

  let result: ScriptRunResult;
  try {
    result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Run Stage Checks (${stage})`,
        cancellable: false
      },
      async () => runCommand(invocation.command, invocation.args, context.projectDir)
    );
  } catch (error) {
    void vscode.window.showErrorMessage(`Run Stage Checks failed: ${errorToMessage(error)}`);
    return {
      ok: false,
      error: errorToMessage(error),
      projectDir: context.projectDir,
      stage
    };
  }

  if (result.exitCode === 0) {
    void vscode.window.showInformationMessage([
      'Checks passed.',
      ...getStageCheckDetails(stage, 'project')
    ].join('\n'));
    return { ok: true, projectDir: context.projectDir, stage };
  }

  const details = pickToastDetails(result);
  void vscode.window.showErrorMessage(details
    ? `Run Stage Checks failed (${stage}): ${details}`
    : `Run Stage Checks failed (${stage}) with exit code ${result.exitCode}.`);
  return {
    ok: false,
    error: details || `Exit code ${result.exitCode}`,
    projectDir: context.projectDir,
    stage
  };
}

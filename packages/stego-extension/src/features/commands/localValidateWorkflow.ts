import * as vscode from 'vscode';
import { errorToMessage } from '../../shared/errors';
import { asString } from '../../shared/value';
import type { ScriptRunResult } from '../../shared/types';
import { parseMarkdownDocument } from '../metadata';
import { getStageCheckDetails } from './stageCheckWorkflow';
import {
  pickToastDetails,
  resolveProjectScriptContext,
  resolveWorkflowCommandInvocation,
  runCommand,
  toProjectRelativePath
} from './workflowUtils';
import type { WorkflowRunResult } from './workflowUtils';

export function getLocalValidateDetails(relativeFile: string, stage: string): string[] {
  return [
    `Ran leaf validation (${relativeFile}).`,
    'Checked metadata and frontmatter.',
    'Checked markdown structure and links.',
    ...getStageCheckDetails(stage, 'file')
  ];
}

export async function runLocalValidateWorkflow(): Promise<WorkflowRunResult> {
  const context = await resolveProjectScriptContext({ requireMarkdown: true });
  if (!context) {
    return { ok: false, cancelled: true };
  }

  const relativeFile = toProjectRelativePath(context.projectDir, context.document.uri.fsPath);
  if (!relativeFile) {
    void vscode.window.showWarningMessage('Validate requires an active file inside the current project.');
    return { ok: false, cancelled: true, projectDir: context.projectDir };
  }

  let stage: string | undefined;
  try {
    const parsed = parseMarkdownDocument(context.document.getText());
    stage = asString(parsed.frontmatter.status)?.toLowerCase();
  } catch (error) {
    void vscode.window.showErrorMessage(`Validate failed: could not parse frontmatter status (${errorToMessage(error)}).`);
    return {
      ok: false,
      error: `could not parse frontmatter status (${errorToMessage(error)})`,
      projectDir: context.projectDir
    };
  }

  if (!stage) {
    void vscode.window.showWarningMessage('Validate requires leaf metadata status to run stage checks.');
    return { ok: false, cancelled: true, projectDir: context.projectDir };
  }

  const validateInvocation = await resolveWorkflowCommandInvocation(context, {
    scriptName: 'validate',
    scriptArgs: ['--file', relativeFile],
    stegoArgs: ['validate', '--project', context.projectId, '--file', relativeFile],
    actionLabel: 'Validate'
  });
  if (!validateInvocation) {
    return { ok: false, cancelled: true, projectDir: context.projectDir };
  }

  const checkStageInvocation = await resolveWorkflowCommandInvocation(context, {
    scriptName: 'check-stage',
    scriptArgs: ['--stage', stage, '--file', relativeFile],
    stegoArgs: ['check-stage', '--project', context.projectId, '--stage', stage, '--file', relativeFile],
    actionLabel: 'Validate'
  });
  if (!checkStageInvocation) {
    return { ok: false, cancelled: true, projectDir: context.projectDir };
  }

  let validateResult: ScriptRunResult;
  let checkStageResult: ScriptRunResult;

  try {
    const workflowResult = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Validate',
        cancellable: false
      },
      async () => {
        const validate = await runCommand(
          validateInvocation.command,
          validateInvocation.args,
          context.projectDir
        );
        if (validate.exitCode !== 0) {
          return { validate, checkStage: undefined as ScriptRunResult | undefined };
        }
        const checkStage = await runCommand(
          checkStageInvocation.command,
          checkStageInvocation.args,
          context.projectDir
        );
        return { validate, checkStage };
      }
    );
    validateResult = workflowResult.validate;
    checkStageResult = workflowResult.checkStage ?? {
      exitCode: 1,
      stdout: '',
      stderr: ''
    };
  } catch (error) {
    void vscode.window.showErrorMessage(`Validate failed: ${errorToMessage(error)}`);
    return {
      ok: false,
      error: errorToMessage(error),
      projectDir: context.projectDir
    };
  }

  if (validateResult.exitCode !== 0) {
    const details = pickToastDetails(validateResult);
    void vscode.window.showErrorMessage(details
      ? `Validate failed: ${details}`
      : `Validate failed with exit code ${validateResult.exitCode}.`);
    return {
      ok: false,
      error: details || `Exit code ${validateResult.exitCode}`,
      projectDir: context.projectDir
    };
  }

  if (checkStageResult.exitCode !== 0) {
    const details = pickToastDetails(checkStageResult);
    void vscode.window.showErrorMessage(details
      ? `Validate failed at stage gate (${stage}): ${details}`
      : `Validate failed at stage gate (${stage}) with exit code ${checkStageResult.exitCode}.`);
    return {
      ok: false,
      error: details || `Stage gate exit code ${checkStageResult.exitCode}`,
      projectDir: context.projectDir
    };
  }

  void vscode.window.showInformationMessage([
    'Checks passed.',
    ...getLocalValidateDetails(relativeFile, stage)
  ].join('\n'));
  return { ok: true, projectDir: context.projectDir };
}

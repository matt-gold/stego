import * as vscode from 'vscode';
import { errorToMessage } from '../../shared/errors';
import { asString } from '../../shared/value';
import type { ScriptRunResult } from '../../shared/types';
import { parseMarkdownDocument } from '../metadata/frontmatterParse';
import { getStageCheckDetails } from './stageCheckWorkflow';
import {
  pickToastDetails,
  resolveProjectScriptContext,
  runCommand,
  toProjectRelativePath
} from './workflowUtils';

export function getLocalValidateDetails(relativeFile: string, stage: string): string[] {
  return [
    `Ran manuscript validation (${relativeFile}).`,
    'Checked metadata and frontmatter.',
    'Checked markdown structure and links.',
    ...getStageCheckDetails(stage, 'file')
  ];
}

export async function runLocalValidateWorkflow(): Promise<void> {
  const context = await resolveProjectScriptContext(['validate', 'check-stage']);
  if (!context) {
    return;
  }

  const relativeFile = toProjectRelativePath(context.projectDir, context.document.uri.fsPath);
  if (!relativeFile) {
    void vscode.window.showWarningMessage('Validate requires an active file inside the current project.');
    return;
  }

  let stage: string | undefined;
  try {
    const parsed = parseMarkdownDocument(context.document.getText());
    stage = asString(parsed.frontmatter.status)?.toLowerCase();
  } catch (error) {
    void vscode.window.showErrorMessage(`Validate failed: could not parse frontmatter status (${errorToMessage(error)}).`);
    return;
  }

  if (!stage) {
    void vscode.window.showWarningMessage('Validate requires manuscript metadata status to run stage checks.');
    return;
  }

  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
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
          npmCommand,
          ['run', 'validate', '--', '--file', relativeFile],
          context.projectDir
        );
        if (validate.exitCode !== 0) {
          return { validate, checkStage: undefined as ScriptRunResult | undefined };
        }
        const checkStage = await runCommand(
          npmCommand,
          ['run', 'check-stage', '--', '--stage', stage as string, '--file', relativeFile],
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
    return;
  }

  if (validateResult.exitCode !== 0) {
    const details = pickToastDetails(validateResult);
    void vscode.window.showErrorMessage(details
      ? `Validate failed: ${details}`
      : `Validate failed with exit code ${validateResult.exitCode}.`);
    return;
  }

  if (checkStageResult.exitCode !== 0) {
    const details = pickToastDetails(checkStageResult);
    void vscode.window.showErrorMessage(details
      ? `Validate failed at stage gate (${stage}): ${details}`
      : `Validate failed at stage gate (${stage}) with exit code ${checkStageResult.exitCode}.`);
    return;
  }

  void vscode.window.showInformationMessage([
    'Checks passed.',
    ...getLocalValidateDetails(relativeFile, stage)
  ].join('\n'));
}

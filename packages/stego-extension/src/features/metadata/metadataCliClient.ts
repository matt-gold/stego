import * as path from 'path';
import * as vscode from 'vscode';
import { pickToastDetails, resolveStegoCommandInvocation, runCommand } from '../commands';
import type { MetadataApplyEnvelope, MetadataApplyPayload } from '@stego/shared/contracts/cli';
import { extractCliErrorMessage, tryParseJson } from '../../shared/cli/json';
import { withJsonPayloadFile } from '../../shared/cli/payload-file';

export type MetadataCliResult =
  | { changed: boolean }
  | { warning: string };

export class MetadataCliClient {
  public async apply(
    markdownPath: string,
    payload: MetadataApplyPayload,
    options?: { showWarning?: boolean }
  ): Promise<MetadataCliResult> {
    const cwd = path.dirname(markdownPath);
    return withJsonPayloadFile('stego-metadata-', payload, async (payloadPath) => {
      const invocation = await resolveStegoCommandInvocation(
        cwd,
        ['metadata', 'apply', markdownPath, '--input', payloadPath, '--format', 'json'],
        'run stego metadata apply',
        { showWarning: options?.showWarning }
      );
      if (!invocation) {
        return { warning: this.reportWarning('Could not edit metadata because @stego/cli is unavailable.', options) };
      }

      let result;
      try {
        result = await runCommand(invocation.command, invocation.args, cwd);
      } catch (error) {
        return {
          warning: this.reportWarning(
            `Could not edit metadata: ${error instanceof Error ? error.message : String(error)}`,
            options
          )
        };
      }

      if (result.exitCode !== 0) {
        const failureMessage = extractCliErrorMessage(result.stdout, result.stderr)
          || pickToastDetails(result)
          || `Exit code ${result.exitCode}`;
        return {
          warning: this.reportWarning(`Could not edit metadata: ${failureMessage}`, options)
        };
      }

      const parsed = tryParseJson<MetadataApplyEnvelope>(result.stdout);
      if (!parsed || parsed.ok !== true || parsed.operation !== 'apply' || !parsed.state) {
        return {
          warning: this.reportWarning('Could not edit metadata: @stego/cli returned an unexpected response.', options)
        };
      }

      return { changed: parsed.changed !== false };
    });
  }

  private reportWarning(message: string, options?: { showWarning?: boolean }): string {
    if (options?.showWarning !== false) {
      void vscode.window.showWarningMessage(message);
    }
    return message;
  }

}

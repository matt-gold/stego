import * as os from 'os';
import * as path from 'path';
import { promises as fs } from 'fs';
import * as vscode from 'vscode';
import { pickToastDetails, resolveStegoCommandInvocation, runCommand } from '../commands/workflowUtils';

type MetadataApplyPayload = {
  frontmatter: Record<string, unknown>;
  body?: string;
  hasFrontmatter?: boolean;
};

type MetadataApplyEnvelope = {
  ok: true;
  operation: 'apply';
  changed?: boolean;
  state?: {
    path: string;
    frontmatter: Record<string, unknown>;
    body: string;
    hasFrontmatter: boolean;
  };
};

type MetadataErrorEnvelope = {
  ok: false;
  message?: string;
};

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
    let payloadPath: string | undefined;
    let payloadDir: string | undefined;

    try {
      payloadPath = await this.writePayload(payload);
      payloadDir = path.dirname(payloadPath);

      const invocation = await resolveStegoCommandInvocation(
        cwd,
        ['metadata', 'apply', markdownPath, '--input', payloadPath, '--format', 'json'],
        'run stego metadata apply',
        { showWarning: options?.showWarning }
      );
      if (!invocation) {
        return { warning: this.reportWarning('Could not edit metadata because stego-cli is unavailable.', options) };
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
        const failureMessage = this.extractErrorMessage(result.stdout, result.stderr)
          || pickToastDetails(result)
          || `Exit code ${result.exitCode}`;
        return {
          warning: this.reportWarning(`Could not edit metadata: ${failureMessage}`, options)
        };
      }

      const parsed = tryParseJson<MetadataApplyEnvelope>(result.stdout);
      if (!parsed || parsed.ok !== true || parsed.operation !== 'apply') {
        return {
          warning: this.reportWarning('Could not edit metadata: stego-cli returned an unexpected response.', options)
        };
      }

      return { changed: parsed.changed !== false };
    } finally {
      if (payloadPath) {
        try {
          await fs.unlink(payloadPath);
        } catch {
          // no-op
        }
      }
      if (payloadDir) {
        try {
          await fs.rmdir(payloadDir);
        } catch {
          // no-op
        }
      }
    }
  }

  private async writePayload(payload: MetadataApplyPayload): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'stego-metadata-'));
    const payloadPath = path.join(dir, 'payload.json');
    await fs.writeFile(payloadPath, `${JSON.stringify(payload)}\n`, 'utf8');
    return payloadPath;
  }

  private reportWarning(message: string, options?: { showWarning?: boolean }): string {
    if (options?.showWarning !== false) {
      void vscode.window.showWarningMessage(message);
    }
    return message;
  }

  private extractErrorMessage(stdout: string, stderr: string): string | undefined {
    const stderrPayload = tryParseJson<MetadataErrorEnvelope>(stderr);
    if (stderrPayload && stderrPayload.ok === false && typeof stderrPayload.message === 'string') {
      return stderrPayload.message;
    }

    const stdoutPayload = tryParseJson<MetadataErrorEnvelope>(stdout);
    if (stdoutPayload && stdoutPayload.ok === false && typeof stdoutPayload.message === 'string') {
      return stdoutPayload.message;
    }

    return undefined;
  }
}

function tryParseJson<T>(text: string): T | undefined {
  const trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return undefined;
  }
}

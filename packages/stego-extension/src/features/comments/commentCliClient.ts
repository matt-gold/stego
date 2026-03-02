import * as os from 'os';
import * as path from 'path';
import { promises as fs } from 'fs';
import * as vscode from 'vscode';
import { pickToastDetails, resolveStegoCommandInvocation, runCommand } from '../commands/workflowUtils';
import type { StegoCommentDocumentState } from './commentTypes';

export type CommentCliOperation =
  | 'read'
  | 'add'
  | 'reply'
  | 'set-status'
  | 'delete'
  | 'clear-resolved'
  | 'sync-anchors';

export type CommentRangePayload = {
  start: { line: number; col: number };
  end: { line: number; col: number };
};

export type CommentAddPayload = {
  message: string;
  author?: string;
  anchor?: {
    range?: CommentRangePayload;
    cursor_line?: number;
    excerpt?: string;
  };
  meta?: Record<string, unknown>;
};

export type CommentReplyPayload = {
  message: string;
  author?: string;
};

export type CommentSyncAnchorsPayload = {
  updates?: Array<{
    id: string;
    start: { line: number; col: number };
    end: { line: number; col: number };
  }>;
  delete_ids?: string[];
};

type CommentCliErrorEnvelope = {
  ok: false;
  code?: string;
  message?: string;
};

type CommentCliSuccessEnvelope = {
  ok: true;
  operation: CommentCliOperation;
  state: StegoCommentDocumentState;
  commentId?: string;
  changedIds?: string[];
  removed?: number;
  updatedCount?: number;
  deletedCount?: number;
};

export type CommentCliWarningResult = {
  warning: string;
};

export type CommentCliSuccessResult<T extends CommentCliOperation> =
  CommentCliSuccessEnvelope & { operation: T };

export type CommentCliResult<T extends CommentCliOperation> =
  | CommentCliWarningResult
  | CommentCliSuccessResult<T>;

type CallOptions = {
  showWarning?: boolean;
};

export class CommentCliClient {
  public async read(manuscriptPath: string, options?: CallOptions): Promise<CommentCliResult<'read'>> {
    return this.invoke('read', manuscriptPath, [], undefined, 'read comments', options);
  }

  public async add(
    manuscriptPath: string,
    payload: CommentAddPayload,
    options?: CallOptions
  ): Promise<CommentCliResult<'add'>> {
    return this.invoke('add', manuscriptPath, [], payload, 'add comment', options);
  }

  public async reply(
    manuscriptPath: string,
    commentId: string,
    payload: CommentReplyPayload,
    options?: CallOptions
  ): Promise<CommentCliResult<'reply'>> {
    return this.invoke(
      'reply',
      manuscriptPath,
      ['--comment-id', commentId],
      payload,
      'reply to comment',
      options
    );
  }

  public async setStatus(
    manuscriptPath: string,
    commentId: string,
    status: 'open' | 'resolved',
    thread: boolean,
    options?: CallOptions
  ): Promise<CommentCliResult<'set-status'>> {
    const extraArgs = ['--comment-id', commentId, '--status', status];
    if (thread) {
      extraArgs.push('--thread');
    }

    return this.invoke('set-status', manuscriptPath, extraArgs, undefined, 'update comment status', options);
  }

  public async delete(
    manuscriptPath: string,
    commentId: string,
    options?: CallOptions
  ): Promise<CommentCliResult<'delete'>> {
    return this.invoke(
      'delete',
      manuscriptPath,
      ['--comment-id', commentId],
      undefined,
      'delete comment',
      options
    );
  }

  public async clearResolved(
    manuscriptPath: string,
    options?: CallOptions
  ): Promise<CommentCliResult<'clear-resolved'>> {
    return this.invoke('clear-resolved', manuscriptPath, [], undefined, 'clear resolved comments', options);
  }

  public async syncAnchors(
    manuscriptPath: string,
    payload: CommentSyncAnchorsPayload,
    options?: CallOptions
  ): Promise<CommentCliResult<'sync-anchors'>> {
    return this.invoke('sync-anchors', manuscriptPath, [], payload, 'sync comment anchors', options);
  }

  private async invoke<T extends CommentCliOperation>(
    subcommand: T,
    manuscriptPath: string,
    extraArgs: string[],
    payload: Record<string, unknown> | undefined,
    actionLabel: string,
    options?: CallOptions
  ): Promise<CommentCliResult<T>> {
    const cwd = path.dirname(manuscriptPath);
    let payloadPath: string | undefined;
    let payloadDir: string | undefined;

    try {
      const args = ['comments', subcommand, manuscriptPath, ...extraArgs];
      if (payload) {
        payloadPath = await this.writePayload(payload);
        payloadDir = path.dirname(payloadPath);
        args.push('--input', payloadPath);
      }
      args.push('--format', 'json');

      const invocation = await resolveStegoCommandInvocation(
        cwd,
        args,
        `run stego comments (${actionLabel})`,
        { showWarning: options?.showWarning }
      );
      if (!invocation) {
        const message = `Could not ${actionLabel} because stego-cli is unavailable.`;
        return {
          warning: message
        };
      }

      let result;
      try {
        result = await runCommand(invocation.command, invocation.args, cwd);
      } catch (error) {
        return {
          warning: this.reportWarning(
            `Could not ${actionLabel}: ${error instanceof Error ? error.message : String(error)}`,
            options
          )
        };
      }

      if (result.exitCode !== 0) {
        const failureMessage = this.extractErrorMessage(result.stdout, result.stderr)
          || pickToastDetails(result)
          || `Exit code ${result.exitCode}`;
        return {
          warning: this.reportWarning(`Could not ${actionLabel}: ${failureMessage}`, options)
        };
      }

      const parsed = tryParseJson<CommentCliSuccessEnvelope>(result.stdout);
      if (!parsed || parsed.ok !== true || !parsed.state || parsed.operation !== subcommand) {
        return {
          warning: this.reportWarning(
            `Could not ${actionLabel}: stego-cli returned an unexpected response.`,
            options
          )
        };
      }

      return parsed as CommentCliSuccessResult<T>;
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

  private async writePayload(payload: Record<string, unknown>): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'stego-comments-'));
    const payloadPath = path.join(dir, 'payload.json');
    await fs.writeFile(payloadPath, `${JSON.stringify(payload)}\n`, 'utf8');
    return payloadPath;
  }

  private reportWarning(message: string, options?: CallOptions): string {
    if (options?.showWarning !== false) {
      void vscode.window.showWarningMessage(message);
    }
    return message;
  }

  private extractErrorMessage(stdout: string, stderr: string): string | undefined {
    const fromStderr = tryParseJson<CommentCliErrorEnvelope>(stderr);
    if (fromStderr && fromStderr.ok === false && typeof fromStderr.message === 'string') {
      return fromStderr.message;
    }

    const fromStdout = tryParseJson<CommentCliErrorEnvelope>(stdout);
    if (fromStdout && fromStdout.ok === false && typeof fromStdout.message === 'string') {
      return fromStdout.message;
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

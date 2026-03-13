import * as path from 'path';
import * as vscode from 'vscode';
import { pickToastDetails, resolveStegoCommandInvocation, runCommand } from '../commands';
import {
  type CommentAddPayload,
  type CommentReplyPayload,
  type CommentSyncAnchorsPayload,
  type CommentsSubcommand,
  type CommentsSuccessEnvelope
} from '@stego/shared/contracts/cli';
import { extractCliErrorMessage, tryParseJson } from '../../shared/cli/json';
import { withJsonPayloadFile } from '../../shared/cli/payload-file';

export type CommentCliOperation = CommentsSubcommand;

export type CommentCliWarningResult = {
  warning: string;
};

export type CommentCliSuccessResult<T extends CommentCliOperation> =
  Extract<CommentsSuccessEnvelope, { operation: T }>;

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
    const runWithArgs = async (args: string[]): Promise<CommentCliResult<T>> => {
      const invocation = await resolveStegoCommandInvocation(
        cwd,
        args,
        `run stego comments (${actionLabel})`,
        { showWarning: options?.showWarning }
      );
      if (!invocation) {
        return {
          warning: `Could not ${actionLabel} because @stego/cli is unavailable.`
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
        const failureMessage = extractCliErrorMessage(result.stdout, result.stderr)
          || pickToastDetails(result)
          || `Exit code ${result.exitCode}`;
        return {
          warning: this.reportWarning(`Could not ${actionLabel}: ${failureMessage}`, options)
        };
      }

      const parsed = tryParseJson<CommentsSuccessEnvelope>(result.stdout);
      if (!parsed || parsed.ok !== true || !('state' in parsed) || parsed.operation !== subcommand) {
        return {
          warning: this.reportWarning(
            `Could not ${actionLabel}: @stego/cli returned an unexpected response.`,
            options
          )
        };
      }

      return parsed as CommentCliSuccessResult<T>;
    };

    const baseArgs = ['comments', subcommand, manuscriptPath, ...extraArgs];
    if (!payload) {
      return runWithArgs([...baseArgs, '--format', 'json']);
    }

    return withJsonPayloadFile('stego-comments-', payload, async (payloadPath) => (
      runWithArgs([...baseArgs, '--input', payloadPath, '--format', 'json'])
    ));
  }

  private reportWarning(message: string, options?: CallOptions): string {
    if (options?.showWarning !== false) {
      void vscode.window.showWarningMessage(message);
    }
    return message;
  }
}

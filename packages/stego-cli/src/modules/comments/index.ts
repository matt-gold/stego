import type { ModuleApi } from "../../app/index.ts";
import type { CommandRegistry } from "../../app/command-registry.ts";
import { registerCommentsReadCommand } from "./commands/comments-read.ts";
import { registerCommentsAddCommand } from "./commands/comments-add.ts";
import { registerCommentsReplyCommand } from "./commands/comments-reply.ts";
import { registerCommentsSetStatusCommand } from "./commands/comments-set-status.ts";
import { registerCommentsDeleteCommand } from "./commands/comments-delete.ts";
import { registerCommentsClearResolvedCommand } from "./commands/comments-clear-resolved.ts";
import { registerCommentsSyncAnchorsCommand } from "./commands/comments-sync-anchors.ts";

export const commentsModule: ModuleApi = {
  registerCommands(registry: CommandRegistry): void {
    registerCommentsReadCommand(registry);
    registerCommentsAddCommand(registry);
    registerCommentsReplyCommand(registry);
    registerCommentsSetStatusCommand(registry);
    registerCommentsDeleteCommand(registry);
    registerCommentsClearResolvedCommand(registry);
    registerCommentsSyncAnchorsCommand(registry);
  }
};

export * from "./types.ts";
export * from "./application/comment-operations.ts";

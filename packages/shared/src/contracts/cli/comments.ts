import type {
  CommentStatus,
  SerializedCommentDocumentState
} from "../../domain/comments/index.ts";
import type { CliOperation } from "./operations.ts";

type CommentsOperation = Extract<CliOperation, `comments.${string}`>;

export type CommentsSubcommand =
  CommentsOperation extends `comments.${infer Subcommand}`
    ? Subcommand
    : never;

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

export type CommentsReadEnvelope = {
  ok: true;
  operation: "read";
  manuscript: string;
  state: SerializedCommentDocumentState;
};

export type CommentsAddEnvelope = {
  ok: true;
  operation: "add";
  manuscript: string;
  commentId: string;
  state: SerializedCommentDocumentState;
};

export type CommentsReplyEnvelope = {
  ok: true;
  operation: "reply";
  manuscript: string;
  commentId: string;
  state: SerializedCommentDocumentState;
};

export type CommentsSetStatusEnvelope = {
  ok: true;
  operation: "set-status";
  manuscript: string;
  status: CommentStatus;
  changedIds: string[];
  state: SerializedCommentDocumentState;
};

export type CommentsDeleteEnvelope = {
  ok: true;
  operation: "delete";
  manuscript: string;
  removed: number;
  state: SerializedCommentDocumentState;
};

export type CommentsClearResolvedEnvelope = {
  ok: true;
  operation: "clear-resolved";
  manuscript: string;
  removed: number;
  state: SerializedCommentDocumentState;
};

export type CommentsSyncAnchorsEnvelope = {
  ok: true;
  operation: "sync-anchors";
  manuscript: string;
  updatedCount: number;
  deletedCount: number;
  state: SerializedCommentDocumentState;
};

export type CommentsSuccessEnvelope =
  | CommentsReadEnvelope
  | CommentsAddEnvelope
  | CommentsReplyEnvelope
  | CommentsSetStatusEnvelope
  | CommentsDeleteEnvelope
  | CommentsClearResolvedEnvelope
  | CommentsSyncAnchorsEnvelope;

export type CommentsSuccessEnvelopeFor<TSubcommand extends CommentsSubcommand> =
  Extract<CommentsSuccessEnvelope, { operation: TSubcommand }>;

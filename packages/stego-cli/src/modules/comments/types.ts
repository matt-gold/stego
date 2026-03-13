import type {
  CommentsSubcommand,
  CommentsSuccessEnvelope
} from "@stego-labs/shared/contracts/cli";

export type { CommentsSubcommand, CommentsSuccessEnvelope };

export type CommentsModuleName = "comments";

export type CommentsOutputFormat = "text" | "json";

export type CommentsOperationResult = {
  payload: CommentsSuccessEnvelope;
  textMessage: string;
};

export type ExecuteCommentsInput = {
  subcommand: CommentsSubcommand;
  cwd: string;
  manuscriptArg: string;
  options: Record<string, unknown>;
};

import type {
  CommentsSubcommand,
  CommentsSuccessEnvelope
} from "../../../../shared/src/contracts/cli/index.ts";

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

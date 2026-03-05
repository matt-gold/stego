import type { CliOperation } from "./operations.ts";

type MetadataOperation = Extract<CliOperation, `metadata.${string}`>;

export type MetadataSubcommand =
  MetadataOperation extends `metadata.${infer Subcommand}`
    ? Subcommand
    : never;

export type MetadataState = {
  path: string;
  hasFrontmatter: boolean;
  lineEnding: string;
  frontmatter: Record<string, unknown>;
  body: string;
};

export type MetadataReadEnvelope = {
  ok: true;
  operation: "read";
  state: MetadataState;
};

export type MetadataApplyEnvelope = {
  ok: true;
  operation: "apply";
  changed: boolean;
  state: MetadataState;
};

export type MetadataSuccessEnvelope = MetadataReadEnvelope | MetadataApplyEnvelope;

export type MetadataSuccessEnvelopeFor<TSubcommand extends MetadataSubcommand> =
  Extract<MetadataSuccessEnvelope, { operation: TSubcommand }>;

export type MetadataApplyPayload = {
  frontmatter: Record<string, unknown>;
  body?: string;
  hasFrontmatter?: boolean;
};

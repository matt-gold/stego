import type {
  MetadataApplyEnvelope,
  MetadataReadEnvelope,
  MetadataState
} from "@stego-labs/shared/contracts/cli";

export type { MetadataApplyEnvelope, MetadataReadEnvelope, MetadataState };

export type MetadataModuleName = "metadata";

export type MetadataOutputFormat = "text" | "json";

export type ReadMetadataInput = {
  cwd: string;
  markdownPath: string;
};

export type ApplyMetadataInput = {
  cwd: string;
  markdownPath: string;
  inputPath: string;
};

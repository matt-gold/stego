import type { StegoNode } from "../../ir/index.ts";
import type { LeafFormat, LeafHeadingTarget } from "@stego-labs/shared/domain/content";
import type { PresentationTarget } from "@stego-labs/shared/domain/templates";

export type ProjectMetadata = Record<string, unknown>;
export type LeafMetadata = Record<string, unknown> & {
  id: string;
};
export type BranchMetadata = {
  label?: string;
};

export type LeafRecord<TMetadata extends LeafMetadata = LeafMetadata> = {
  kind: "leaf";
  id: string;
  format: LeafFormat;
  path: string;
  relativePath: string;
  titleFromFilename: string;
  metadata: TMetadata;
  body: string;
  order: number | null;
  headings: LeafHeadingTarget[];
};

export type BranchRecord<TMetadata extends BranchMetadata = BranchMetadata> = {
  kind: "branch";
  key: string;
  name: string;
  label: string;
  parentKey?: string;
  depth: number;
  relativeDir: string;
  path?: string;
  relativePath?: string;
  metadata: TMetadata;
  body?: string;
};

export type ProjectRecord<TMetadata extends ProjectMetadata = ProjectMetadata> = {
  project: {
    id: string;
    root: string;
    metadata: TMetadata;
  };
};

export type TemplateContext<
  TProjectMetadata extends ProjectMetadata = ProjectMetadata,
  TLeafMetadata extends LeafMetadata = LeafMetadata,
  TBranchMetadata extends BranchMetadata = BranchMetadata
> = ProjectRecord<TProjectMetadata> & {
  content: LeafRecord<TLeafMetadata>[];
  branches: BranchRecord<TBranchMetadata>[];
};

export type StegoTemplate<
  TProjectMetadata extends ProjectMetadata = ProjectMetadata,
  TLeafMetadata extends LeafMetadata = LeafMetadata,
  TBranchMetadata extends BranchMetadata = BranchMetadata,
  TTargets extends PresentationTarget = never
> = {
  kind: "stego-template";
  targets: readonly TTargets[] | null;
  render: (context: TemplateContext<TProjectMetadata, TLeafMetadata, TBranchMetadata>) => StegoNode;
};

export type TemplateDefinitionOptions<TTargets extends readonly PresentationTarget[]> = {
  targets: TTargets;
};

import type { StegoNode } from "../../ir/index.ts";
import type {
  BranchLeafPolicy,
  LeafFormat,
  LeafHeadingTarget
} from "@stego-labs/shared/domain/content";
import type { PresentationTarget } from "@stego-labs/shared/domain/templates";

export type ProjectMetadata = Record<string, unknown>;
export type LeafMetadata = Record<string, unknown> & {
  id: string;
};
export type BranchMetadata = {
  label?: string;
  leafPolicy?: BranchLeafPolicy;
};

export type LeafRecord<TMetadata extends LeafMetadata = LeafMetadata> = {
  kind: "leaf";
  id: string;
  branchId: string;
  format: LeafFormat;
  path: string;
  relativePath: string;
  titleFromFilename: string;
  metadata: TMetadata;
  body: string;
  order: number | null;
  headings: LeafHeadingTarget[];
};

export type BranchRecord<
  TMetadata extends BranchMetadata = BranchMetadata,
  TLeafMetadata extends LeafMetadata = LeafMetadata
> = {
  kind: "branch";
  id: string;
  name: string;
  label: string;
  parentId?: string;
  depth: number;
  relativeDir: string;
  path?: string;
  relativePath?: string;
  metadata: TMetadata;
  body?: string;
  leaves: LeafRecord<TLeafMetadata>[];
  branches: BranchRecord<TMetadata, TLeafMetadata>[];
};

export type ContentTree<
  TBranchMetadata extends BranchMetadata = BranchMetadata,
  TLeafMetadata extends LeafMetadata = LeafMetadata
> = {
  kind: "content";
  name: "content";
  label: string;
  relativeDir: string;
  path?: string;
  relativePath?: string;
  metadata: TBranchMetadata;
  body?: string;
  leaves: LeafRecord<TLeafMetadata>[];
  branches: BranchRecord<TBranchMetadata, TLeafMetadata>[];
};

export type ProjectRecord<TMetadata extends ProjectMetadata = ProjectMetadata> = {
  project: {
    id: string;
    root: string;
    metadata: TMetadata;
  };
};

export type TemplateContext<
  TLeafMetadata extends LeafMetadata = LeafMetadata,
  TBranchMetadata extends BranchMetadata = BranchMetadata,
  TProjectMetadata extends ProjectMetadata = ProjectMetadata
> = ProjectRecord<TProjectMetadata> & {
  content: ContentTree<TBranchMetadata, TLeafMetadata>;
  allLeaves: LeafRecord<TLeafMetadata>[];
  allBranches: BranchRecord<TBranchMetadata, TLeafMetadata>[];
};

export type TemplateTypes<
  TLeafMetadata extends LeafMetadata = LeafMetadata,
  TBranchMetadata extends BranchMetadata = BranchMetadata,
  TProjectMetadata extends ProjectMetadata = ProjectMetadata,
  TTargets extends readonly PresentationTarget[] | null = null
> = {
  leafMetadata: TLeafMetadata;
  branchMetadata: TBranchMetadata;
  projectMetadata: TProjectMetadata;
  targets: TTargets;
};

export type StegoTemplate<
  TLeafMetadata extends LeafMetadata = LeafMetadata,
  TBranchMetadata extends BranchMetadata = BranchMetadata,
  TProjectMetadata extends ProjectMetadata = ProjectMetadata,
  TTargets extends PresentationTarget = never
> = {
  kind: "stego-template";
  targets: readonly TTargets[] | null;
  render: (context: TemplateContext<TLeafMetadata, TBranchMetadata, TProjectMetadata>) => StegoNode;
};

export type TemplateDefinitionOptions<TTargets extends readonly PresentationTarget[]> = {
  targets: TTargets;
};

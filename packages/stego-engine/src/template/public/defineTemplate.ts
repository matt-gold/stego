import type { StegoNode } from "../../ir/index.ts";
import { isPresentationTarget, type PresentationTarget } from "@stego-labs/shared/domain/templates";
import type { StegoApi } from "./components.ts";
import { Stego } from "./components.ts";
import type {
  BranchMetadata,
  LeafMetadata,
  ProjectMetadata,
  StegoTemplate,
  TemplateContext,
  TemplateDefinitionOptions,
  TemplateTypes
} from "./types.ts";

type AnyTemplateTypes = TemplateTypes<LeafMetadata, BranchMetadata, ProjectMetadata, readonly PresentationTarget[] | null>;
type LeafMetadataOf<TTypes extends AnyTemplateTypes> = TTypes["leafMetadata"];
type BranchMetadataOf<TTypes extends AnyTemplateTypes> = TTypes["branchMetadata"];
type ProjectMetadataOf<TTypes extends AnyTemplateTypes> = TTypes["projectMetadata"];

export function defineTemplate<
  TTypes extends AnyTemplateTypes = TemplateTypes
>(
  render: (
    context: TemplateContext<LeafMetadataOf<TTypes>, BranchMetadataOf<TTypes>, ProjectMetadataOf<TTypes>>
  ) => StegoNode
): StegoTemplate<LeafMetadataOf<TTypes>, BranchMetadataOf<TTypes>, ProjectMetadataOf<TTypes>>;

export function defineTemplate<
  const TTargets extends readonly PresentationTarget[],
  TLeafMetadata extends LeafMetadata = LeafMetadata,
  TBranchMetadata extends BranchMetadata = BranchMetadata,
  TProjectMetadata extends ProjectMetadata = ProjectMetadata
>(
  options: TemplateDefinitionOptions<TTargets>,
  render: (
    context: TemplateContext<TLeafMetadata, TBranchMetadata, TProjectMetadata>,
    stego: StegoApi<TTargets[number]>
  ) => StegoNode
): StegoTemplate<TLeafMetadata, TBranchMetadata, TProjectMetadata, TTargets[number]>;

export function defineTemplate<
  TTypes extends AnyTemplateTypes & { targets: readonly PresentationTarget[] }
>(
  options: TemplateDefinitionOptions<TTypes["targets"]>,
  render: (
    context: TemplateContext<LeafMetadataOf<TTypes>, BranchMetadataOf<TTypes>, ProjectMetadataOf<TTypes>>,
    stego: StegoApi<TTypes["targets"][number]>
  ) => StegoNode
): StegoTemplate<
  LeafMetadataOf<TTypes>,
  BranchMetadataOf<TTypes>,
  ProjectMetadataOf<TTypes>,
  TTypes["targets"][number]
>;

export function defineTemplate<
  TLeafMetadata extends LeafMetadata = LeafMetadata,
  TBranchMetadata extends BranchMetadata = BranchMetadata,
  TProjectMetadata extends ProjectMetadata = ProjectMetadata,
  TTargets extends PresentationTarget = never
>(
  optionsOrRender:
    | TemplateDefinitionOptions<readonly TTargets[]>
    | ((context: TemplateContext<TLeafMetadata, TBranchMetadata, TProjectMetadata>) => StegoNode),
  maybeRender?: (
    context: TemplateContext<TLeafMetadata, TBranchMetadata, TProjectMetadata>,
    stego: StegoApi<TTargets>
  ) => StegoNode
): StegoTemplate<TLeafMetadata, TBranchMetadata, TProjectMetadata, TTargets> {
  if (typeof optionsOrRender === "function") {
    return {
      kind: "stego-template",
      targets: null,
      render: optionsOrRender
    } as StegoTemplate<TLeafMetadata, TBranchMetadata, TProjectMetadata, TTargets>;
  }

  if (typeof maybeRender !== "function") {
    throw new Error("Target-aware templates must call defineTemplate({ targets }, render).");
  }

  const rawTargets = [...optionsOrRender.targets];
  if (rawTargets.length === 0) {
    throw new Error("Target-aware templates must declare one or more presentation targets.");
  }

  const invalidTargets = rawTargets.filter((target) => !isPresentationTarget(target));
  if (invalidTargets.length > 0) {
    throw new Error("Target-aware templates may only declare docx, pdf, or epub.");
  }

  if (new Set(rawTargets).size !== rawTargets.length) {
    throw new Error("Target-aware templates may not declare duplicate presentation targets.");
  }

  const targets = rawTargets as readonly TTargets[];
  return {
    kind: "stego-template",
    targets,
    render: (context) => maybeRender(context, Stego as unknown as StegoApi<TTargets>)
  };
}

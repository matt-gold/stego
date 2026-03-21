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
  TemplateDefinitionOptions
} from "./types.ts";

export function defineTemplate<
  TLeafMetadata extends LeafMetadata = LeafMetadata,
  TBranchMetadata extends BranchMetadata = BranchMetadata,
  TProjectMetadata extends ProjectMetadata = ProjectMetadata
>(
  render: (
    context: TemplateContext<TLeafMetadata, TBranchMetadata, TProjectMetadata>
  ) => StegoNode
): StegoTemplate<TLeafMetadata, TBranchMetadata, TProjectMetadata>;

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
    throw new Error("Target-aware templates may only declare docx, pdf, epub, or latex.");
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

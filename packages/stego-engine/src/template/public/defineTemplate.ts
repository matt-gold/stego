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
  TProjectMetadata extends ProjectMetadata = ProjectMetadata,
  TLeafMetadata extends LeafMetadata = LeafMetadata,
  TBranchMetadata extends BranchMetadata = BranchMetadata
>(
  render: (context: TemplateContext<TProjectMetadata, TLeafMetadata, TBranchMetadata>) => StegoNode
): StegoTemplate<TProjectMetadata, TLeafMetadata, TBranchMetadata>;

export function defineTemplate<
  TProjectMetadata extends ProjectMetadata,
  TLeafMetadata extends LeafMetadata,
  TBranchMetadata extends BranchMetadata,
  const TTargets extends readonly PresentationTarget[]
>(
  options: TemplateDefinitionOptions<TTargets>,
  render: (
    context: TemplateContext<TProjectMetadata, TLeafMetadata, TBranchMetadata>,
    stego: StegoApi<TTargets[number]>
  ) => StegoNode
): StegoTemplate<TProjectMetadata, TLeafMetadata, TBranchMetadata, TTargets[number]>;

export function defineTemplate<
  TProjectMetadata extends ProjectMetadata = ProjectMetadata,
  TLeafMetadata extends LeafMetadata = LeafMetadata,
  TBranchMetadata extends BranchMetadata = BranchMetadata,
  TTargets extends PresentationTarget = never
>(
  optionsOrRender:
    | TemplateDefinitionOptions<readonly TTargets[]>
    | ((context: TemplateContext<TProjectMetadata, TLeafMetadata, TBranchMetadata>) => StegoNode),
  maybeRender?: (
    context: TemplateContext<TProjectMetadata, TLeafMetadata, TBranchMetadata>,
    stego: StegoApi<TTargets>
  ) => StegoNode
): StegoTemplate<TProjectMetadata, TLeafMetadata, TBranchMetadata, TTargets> {
  if (typeof optionsOrRender === "function") {
    return {
      kind: "stego-template",
      targets: null,
      render: optionsOrRender
    } as StegoTemplate<TProjectMetadata, TLeafMetadata, TBranchMetadata, TTargets>;
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

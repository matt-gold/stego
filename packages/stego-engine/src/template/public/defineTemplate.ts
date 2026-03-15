import type { StegoNode } from "../../ir/index.ts";
import type {
  BranchMetadata,
  LeafMetadata,
  ProjectMetadata,
  StegoTemplate,
  TemplateContext
} from "./types.ts";

export function defineTemplate<
  TProjectMetadata extends ProjectMetadata = ProjectMetadata,
  TLeafMetadata extends LeafMetadata = LeafMetadata,
  TBranchMetadata extends BranchMetadata = BranchMetadata
>(
  render: (context: TemplateContext<TProjectMetadata, TLeafMetadata, TBranchMetadata>) => StegoNode
): StegoTemplate<TProjectMetadata, TLeafMetadata, TBranchMetadata> {
  return {
    kind: "stego-template",
    render
  };
}

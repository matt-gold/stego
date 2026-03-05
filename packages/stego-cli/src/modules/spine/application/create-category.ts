import { createSpineCategory } from "../domain/spine.ts";
import { readRequiredMetadata, writeRequiredMetadata } from "../infra/spine-repo.ts";
import type { SpineNewCategoryEnvelope, SpineProjectContext } from "../types.ts";

export type CreateSpineCategoryInput = {
  project: SpineProjectContext;
  key: string;
  label?: string;
  requireMetadata: boolean;
};

export function createSpineCategoryForProject(input: CreateSpineCategoryInput): SpineNewCategoryEnvelope {
  const requiredMetadata = readRequiredMetadata(input.project.meta);
  const result = createSpineCategory(
    input.project.root,
    input.project.spineDir,
    input.key,
    input.label,
    requiredMetadata,
    input.requireMetadata
  );

  if (input.requireMetadata && result.requiredMetadataUpdated) {
    writeRequiredMetadata(input.project.root, input.project.meta, requiredMetadata);
  }

  return {
    ok: true,
    operation: "new-category",
    result
  };
}

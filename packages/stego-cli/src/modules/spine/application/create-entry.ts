import { createSpineEntry } from "../domain/spine.ts";
import type { SpineNewEntryEnvelope, SpineProjectContext } from "../types.ts";

export type CreateSpineEntryInput = {
  project: SpineProjectContext;
  category: string;
  filename?: string;
};

export function createSpineEntryForProject(input: CreateSpineEntryInput): SpineNewEntryEnvelope {
  const result = createSpineEntry(
    input.project.root,
    input.project.spineDir,
    input.category,
    input.filename
  );

  return {
    ok: true,
    operation: "new",
    result
  };
}

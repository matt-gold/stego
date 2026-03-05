import { readSpineCatalog } from "../domain/spine.ts";
import type { SpineProjectContext, SpineReadEnvelope } from "../types.ts";

export function readSpineCatalogForProject(project: SpineProjectContext): SpineReadEnvelope {
  const catalog = readSpineCatalog(project.root, project.spineDir);
  return {
    ok: true,
    operation: "read",
    state: {
      projectId: project.id,
      categories: catalog.categories,
      issues: catalog.issues
    }
  };
}

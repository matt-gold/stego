import path from "node:path";
import { createCollection } from "../../collections/index.ts";
import type { TemplateContext } from "../../template/index.ts";
import type { BuildTemplateContextInput } from "./types.ts";
import { loadManuscripts } from "../internal/load-manuscripts.ts";
import { loadProject } from "../internal/load-project.ts";
import { loadSpine } from "../internal/load-spine.ts";

export function buildTemplateContext(input: BuildTemplateContextInput): TemplateContext {
  const manuscriptDir = input.manuscriptDir ?? path.join(input.projectRoot, "manuscript");
  const spineDir = input.spineDir ?? path.join(input.projectRoot, "spine");
  const project = loadProject(input.projectRoot);
  const manuscripts = loadManuscripts(input.projectRoot, manuscriptDir, project.metadata);
  const spine = loadSpine(input.projectRoot, spineDir);

  return {
    project,
    collections: {
      manuscripts: createCollection(manuscripts),
      spineEntries: createCollection(spine.entries),
      spineCategories: createCollection(spine.categories)
    }
  };
}

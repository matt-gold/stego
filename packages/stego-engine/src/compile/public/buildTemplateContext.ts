import path from "node:path";
import type { TemplateContext } from "../../template/index.ts";
import type { BuildTemplateContextInput } from "./types.ts";
import { loadContentGraph } from "../internal/load-content.ts";
import { loadProject } from "../internal/load-project.ts";

export function buildTemplateContext(input: BuildTemplateContextInput): TemplateContext {
  const contentDir = input.contentDir ?? path.join(input.projectRoot, "content");
  const project = loadProject(input.projectRoot);
  const graph = loadContentGraph(input.projectRoot, contentDir, project.metadata);

  return {
    project,
    content: graph.leaves,
    branches: graph.branches
  };
}

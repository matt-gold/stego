import path from "node:path";
import type { TemplateContext } from "../../template/index.ts";
import type { BuildTemplateContextInput } from "./types.ts";
import { loadContentGraph } from "../internal/load-content.ts";
import { loadProject } from "../internal/load-project.ts";

export function buildTemplateContext(input: BuildTemplateContextInput): TemplateContext {
  const contentDir = input.contentDir ?? path.join(input.projectRoot, "content");
  const project = loadProject(input.projectRoot);
  const graph = loadContentGraph(input.projectRoot, contentDir, project.metadata);
  const rootBranch = graph.branches.find((branch) => branch.id === "");
  if (!rootBranch) {
    throw new Error("Content tree is missing the root branch.");
  }

  return {
    project,
    content: {
      kind: "content",
      name: "content",
      label: rootBranch.label,
      relativeDir: rootBranch.relativeDir,
      path: rootBranch.path,
      relativePath: rootBranch.relativePath,
      metadata: rootBranch.metadata,
      body: rootBranch.body,
      leaves: rootBranch.leaves,
      branches: rootBranch.branches
    },
    allLeaves: graph.leaves,
    allBranches: graph.branches
  };
}

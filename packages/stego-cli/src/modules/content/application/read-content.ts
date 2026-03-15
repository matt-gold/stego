import { buildTemplateContext } from "@stego-labs/engine";
import type { ProjectContext } from "../../project/index.ts";

export function readContent(project: ProjectContext) {
  return buildTemplateContext({
    projectRoot: project.root,
    contentDir: project.contentDir
  }).allLeaves;
}

export function parseContentOutputFormat(raw: string | undefined): "text" | "json" {
  if (!raw || raw === "text") {
    return "text";
  }
  if (raw === "json") {
    return "json";
  }
  throw new Error("Invalid --format value. Use 'text' or 'json'.");
}

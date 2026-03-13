import fs from "node:fs";
import path from "node:path";

export type LoadedProject = {
  id: string;
  root: string;
  metadata: Record<string, unknown>;
};

export function loadProject(projectRoot: string): LoadedProject {
  const projectJsonPath = path.join(projectRoot, "stego-project.json");
  const raw = fs.readFileSync(projectJsonPath, "utf8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;

  const id = typeof parsed.id === "string" && parsed.id.trim()
    ? parsed.id.trim()
    : path.basename(projectRoot);

  return {
    id,
    root: projectRoot,
    metadata: parsed
  };
}

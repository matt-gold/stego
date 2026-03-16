import type { ProjectContext } from "../project/index.ts";

export type ManuscriptModuleName = "manuscript";

export type LeafOutputFormat = "text" | "json";

export type LeafOrderEntry = {
  order: number;
  filename: string;
};

export type NewLeafInput = {
  project: ProjectContext;
  requestedPrefixRaw?: string;
  requestedFilenameRaw?: string;
  requestedIdRaw?: string;
  requestedDirRaw?: string;
};

export type NewLeafResult = {
  projectId: string;
  filePath: string;
};

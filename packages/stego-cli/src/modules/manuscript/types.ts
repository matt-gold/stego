import type { ProjectContext } from "../project/index.ts";

export type ManuscriptModuleName = "manuscript";

export type ManuscriptOutputFormat = "text" | "json";

export type ManuscriptOrderEntry = {
  order: number;
  filename: string;
};

export type NewManuscriptInput = {
  project: ProjectContext;
  requestedPrefixRaw?: string;
  requestedFilenameRaw?: string;
};

export type NewManuscriptResult = {
  projectId: string;
  filePath: string;
};

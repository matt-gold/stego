import type { ProjectContext } from "../project/index.ts";

export type ContentModuleName = "content";

export type ContentOutputFormat = "text" | "json";

export type ReadContentInput = {
  project: ProjectContext;
};

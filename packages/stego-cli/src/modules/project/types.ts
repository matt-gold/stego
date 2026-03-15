import type { WorkspaceContext } from "../workspace/index.ts";

export type ProjectModuleName = "project";

export type ProjectMeta = {
  id?: string;
  title?: string;
  subtitle?: string;
  author?: string;
  requiredMetadata?: unknown;
  [key: string]: unknown;
};

export type ProjectContext = {
  id: string;
  root: string;
  contentDir: string;
  notesDir: string;
  distDir: string;
  meta: ProjectMeta;
  workspace: WorkspaceContext;
};

export type ResolveProjectInput = {
  workspace: WorkspaceContext;
  cwd: string;
  env: NodeJS.ProcessEnv;
  explicitProjectId?: string;
};

export type ProjectOutputFormat = "text" | "json";

export type ProseFontMode = "yes" | "no" | "prompt";

export type CreateProjectInput = {
  workspace: WorkspaceContext;
  projectId?: string;
  title?: string;
  enableProseFont?: boolean;
};

export type CreateProjectResult = {
  projectId: string;
  projectPath: string;
  files: string[];
};

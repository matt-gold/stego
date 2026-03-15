export type WorkspaceModuleName = "workspace";

export const ROOT_CONFIG_FILENAME = "stego.config.json";

export type WorkspaceConfig = {
  projectsDir: string;
  contentDir: string;
  notesDir: string;
  distDir: string;
  requiredMetadata: string[];
  allowedStatuses: string[];
  stagePolicies: Record<string, unknown>;
};

export type WorkspaceContext = {
  repoRoot: string;
  configPath: string;
  config: WorkspaceConfig;
};

export type WorkspaceProjectDescriptor = {
  id: string;
  root: string;
  projectJsonPath: string;
};

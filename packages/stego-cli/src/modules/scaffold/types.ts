export type ScaffoldModuleName = "scaffold";

export type InitWorkspaceInput = {
  cwd: string;
  force: boolean;
};

export type InitWorkspaceResult = {
  targetRoot: string;
  copiedPaths: string[];
};

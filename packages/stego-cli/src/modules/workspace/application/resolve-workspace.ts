import path from "node:path";
import { CliError } from "@stego/shared/contracts/cli";
import { ROOT_CONFIG_FILENAME, type WorkspaceConfig, type WorkspaceContext } from "../types.ts";
import { findNearestFileUpward, isDirectory, pathExists, readJsonFile } from "../infra/workspace-repo.ts";

export type ResolveWorkspaceInput = {
  cwd: string;
  rootOption?: string;
};

export function resolveWorkspaceContext(input: ResolveWorkspaceInput): WorkspaceContext {
  if (input.rootOption) {
    return resolveFromExplicitRoot(input.cwd, input.rootOption);
  }

  const discoveredConfigPath = findNearestFileUpward(input.cwd, ROOT_CONFIG_FILENAME);
  if (!discoveredConfigPath) {
    const legacyConfigPath = findNearestFileUpward(input.cwd, "writing.config.json");
    if (legacyConfigPath) {
      throw new CliError(
        "WORKSPACE_NOT_FOUND",
        `Found legacy '${path.basename(legacyConfigPath)}' at '${path.dirname(legacyConfigPath)}'. Rename it to '${ROOT_CONFIG_FILENAME}'.`
      );
    }

    throw new CliError(
      "WORKSPACE_NOT_FOUND",
      `No Stego workspace found from '${input.cwd}'. Run 'stego init' or pass --root <path>.`
    );
  }

  const repoRoot = path.dirname(discoveredConfigPath);
  const config = parseWorkspaceConfig(discoveredConfigPath);
  return {
    repoRoot,
    configPath: discoveredConfigPath,
    config
  };
}

function resolveFromExplicitRoot(cwd: string, rootOption: string): WorkspaceContext {
  const explicitRoot = path.resolve(cwd, rootOption);
  if (!pathExists(explicitRoot) || !isDirectory(explicitRoot)) {
    throw new CliError(
      "WORKSPACE_NOT_FOUND",
      `Workspace root does not exist or is not a directory: ${explicitRoot}`
    );
  }

  const explicitConfigPath = path.join(explicitRoot, ROOT_CONFIG_FILENAME);
  if (!pathExists(explicitConfigPath)) {
    const legacyConfigPath = path.join(explicitRoot, "writing.config.json");
    if (pathExists(legacyConfigPath)) {
      throw new CliError(
        "WORKSPACE_NOT_FOUND",
        `Found legacy 'writing.config.json' at '${explicitRoot}'. Rename it to '${ROOT_CONFIG_FILENAME}'.`
      );
    }

    throw new CliError(
      "WORKSPACE_NOT_FOUND",
      `No Stego workspace found at '${explicitRoot}'. Expected '${ROOT_CONFIG_FILENAME}'.`
    );
  }

  return {
    repoRoot: explicitRoot,
    configPath: explicitConfigPath,
    config: parseWorkspaceConfig(explicitConfigPath)
  };
}

function parseWorkspaceConfig(configPath: string): WorkspaceConfig {
  let parsed: unknown;
  try {
    parsed = readJsonFile<unknown>(configPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CliError("INVALID_CONFIGURATION", `Invalid JSON at ${configPath}: ${message}`);
  }

  if (!isWorkspaceConfig(parsed)) {
    throw new CliError(
      "INVALID_CONFIGURATION",
      `Invalid Stego workspace config at ${configPath}.`
    );
  }

  return parsed;
}

function isWorkspaceConfig(value: unknown): value is WorkspaceConfig {
  if (!isPlainObject(value)) {
    return false;
  }

  return typeof value.projectsDir === "string"
    && typeof value.chapterDir === "string"
    && typeof value.spineDir === "string"
    && typeof value.notesDir === "string"
    && typeof value.distDir === "string"
    && Array.isArray(value.requiredMetadata)
    && Array.isArray(value.allowedStatuses)
    && isPlainObject(value.stagePolicies);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

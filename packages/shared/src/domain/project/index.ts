import path from "node:path";

export const PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
export const DEFAULT_MANUSCRIPT_SUBDIR = "manuscript";
export const MANUSCRIPT_SUBDIR_CONFIG_KEY = "manuscriptSubdir";

export function isValidProjectId(value: string): boolean {
  return PROJECT_ID_PATTERN.test(value);
}

export type ManuscriptScopeResolution = {
  manuscriptSubdir?: string,
  manuscriptDir: string,
  scopeKey: string,
  issue?: string,
  source: "explicit" | "default-manuscript" | "content-root",
};

export function normalizeManuscriptSubdir(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/");
}

export function validateManuscriptSubdir(value: unknown): string | undefined {
  if (value == null) {
    return undefined;
  }
  if (typeof value !== "string") {
    return `'${MANUSCRIPT_SUBDIR_CONFIG_KEY}' must be a string relative to content/.`;
  }

  const normalized = normalizeManuscriptSubdir(value);
  if (!normalized) {
    return `'${MANUSCRIPT_SUBDIR_CONFIG_KEY}' must not be empty.`;
  }
  if (normalized === "." || normalized === "..") {
    return `'${MANUSCRIPT_SUBDIR_CONFIG_KEY}' must stay within content/.`;
  }
  if (normalized.startsWith("../") || normalized.includes("/../")) {
    return `'${MANUSCRIPT_SUBDIR_CONFIG_KEY}' must stay within content/.`;
  }
  if (/^[A-Za-z]:\//.test(normalized) || normalized.startsWith("/")) {
    return `'${MANUSCRIPT_SUBDIR_CONFIG_KEY}' must be relative to content/, not an absolute path.`;
  }

  return undefined;
}

export function resolveProjectManuscriptScope(
  contentDir: string,
  projectMeta?: Record<string, unknown>,
  pathExists: (filePath: string) => boolean = () => false,
): ManuscriptScopeResolution {
  const raw = projectMeta?.[MANUSCRIPT_SUBDIR_CONFIG_KEY];
  const issue = validateManuscriptSubdir(raw);
  if (issue) {
    return resolveImplicitManuscriptScope(contentDir, pathExists, issue);
  }

  if (typeof raw === "string") {
    const manuscriptSubdir = normalizeManuscriptSubdir(raw);
    return {
      manuscriptSubdir,
      manuscriptDir: joinPath(contentDir, manuscriptSubdir),
      scopeKey: manuscriptSubdir,
      source: "explicit",
    };
  }

  return resolveImplicitManuscriptScope(contentDir, pathExists);
}

function resolveImplicitManuscriptScope(
  contentDir: string,
  pathExists: (filePath: string) => boolean,
  issue?: string,
): ManuscriptScopeResolution {
  const manuscriptDir = joinPath(contentDir, DEFAULT_MANUSCRIPT_SUBDIR);
  if (pathExists(manuscriptDir)) {
    return {
      manuscriptSubdir: DEFAULT_MANUSCRIPT_SUBDIR,
      manuscriptDir,
      scopeKey: DEFAULT_MANUSCRIPT_SUBDIR,
      issue,
      source: "default-manuscript",
    };
  }

  return {
    manuscriptDir: contentDir,
    scopeKey: ".",
    issue,
    source: "content-root",
  };
}

function joinPath(basePath: string, relativePath: string): string {
  return path.resolve(basePath, ...relativePath.split("/"));
}

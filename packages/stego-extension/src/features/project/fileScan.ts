import * as path from 'path';
import * as fsSync from 'fs';
import { promises as fs, type Dirent } from 'fs';
import { isBranchFile, isSupportedLeafContentFile } from '@stego-labs/shared/domain/content';
import { resolveProjectManuscriptScope } from '@stego-labs/shared/domain/project';
import { CONTENT_DIR } from '../../shared/constants';
import { normalizeFsPath, uniqueResolvedPaths } from '../../shared/path';
import type { ProjectBranch } from '../../shared/types';

export async function buildProjectScanPlan(
  projectDir: string
): Promise<{ files: string[]; stampParts: string[] }> {
  const contentRoot = path.join(projectDir, CONTENT_DIR);
  const files = await isDirectory(contentRoot)
    ? uniqueResolvedPaths(await collectMarkdownFiles(contentRoot))
    : [];
  const stampParts = await buildFileStampParts(files);
  return { files, stampParts };
}

export async function resolveBranchNotesFile(projectDir: string, notesFile: string): Promise<string | undefined> {
  const trimmed = notesFile.trim().replace(/\\/g, '/');
  if (!trimmed || path.isAbsolute(trimmed) || trimmed.startsWith('../') || trimmed.includes('/../')) {
    return undefined;
  }

  const contentRoot = path.resolve(path.join(projectDir, CONTENT_DIR));
  const candidate = path.resolve(path.join(contentRoot, trimmed));
  if (!(candidate === contentRoot || candidate.startsWith(`${contentRoot}${path.sep}`))) {
    return undefined;
  }
  return (await isFile(candidate)) ? candidate : undefined;
}

export async function isFile(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

export async function collectMarkdownFiles(rootDir: string): Promise<string[]> {
  const results: string[] = [];
  const stack = [path.resolve(rootDir)];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    if (!currentDir) {
      continue;
    }

    let entries: Dirent[];
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (!shouldSkipScanDirectory(entry.name)) {
          stack.push(fullPath);
        }
        continue;
      }

      if (entry.isFile() && (isSupportedLeafContentFile(fullPath) || isBranchFile(fullPath))) {
        results.push(fullPath);
      }
    }
  }

  results.sort((a, b) => a.localeCompare(b));
  return results;
}

export async function collectProjectContentFiles(projectDir: string): Promise<string[]> {
  const roots = [
    path.join(projectDir, CONTENT_DIR),
    path.join(projectDir, 'notes')
  ];

  const files: string[] = [];
  for (const root of roots) {
    if (!(await isDirectory(root))) {
      continue;
    }

    const discovered = await collectMarkdownFiles(root);
    files.push(...discovered);
  }

  return uniqueResolvedPaths(files).sort((a, b) => a.localeCompare(b));
}

export async function collectManuscriptMarkdownFiles(projectDir: string, manuscriptDir?: string): Promise<string[]> {
  const contentRoot = path.join(projectDir, CONTENT_DIR);
  const resolvedManuscriptDir = manuscriptDir ?? resolveProjectManuscriptScope(
    contentRoot,
    undefined,
    (filePath) => fsSync.existsSync(filePath) && fsSync.statSync(filePath).isDirectory()
  ).manuscriptDir;
  if (!(await isDirectory(resolvedManuscriptDir))) {
    return [];
  }
  return uniqueResolvedPaths(await collectMarkdownFiles(resolvedManuscriptDir));
}

export async function isDirectory(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

export function shouldSkipScanDirectory(name: string): boolean {
  const value = name.toLowerCase();
  return value === '.git'
    || value === 'node_modules'
    || value === '.stego'
    || value === 'dist'
    || value === 'out'
    || value === '.next'
    || value === '.vscode';
}

export async function resolveCurrentBranchFile(
  projectDir: string,
  branches: ProjectBranch[],
  currentFilePath: string
): Promise<ProjectBranch | undefined> {
  const normalizedCurrent = normalizeFsPath(path.resolve(currentFilePath));
  for (const branch of branches) {
    if (!branch.notesFile) {
      continue;
    }

    const resolved = await resolveBranchNotesFile(projectDir, branch.notesFile);
    if (!resolved) {
      continue;
    }

    if (normalizeFsPath(resolved) === normalizedCurrent) {
      return branch;
    }
  }

  return undefined;
}

export async function buildFileStampParts(files: string[]): Promise<string[]> {
  const parts: string[] = [];

  for (const filePath of files) {
    try {
      const stat = await fs.stat(filePath);
      parts.push(`${filePath}:${stat.mtimeMs}`);
    } catch {
      parts.push(`${filePath}:missing`);
    }
  }

  return parts;
}

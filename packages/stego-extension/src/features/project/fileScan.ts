import * as path from 'path';
import { promises as fs, type Dirent } from 'fs';
import { SPINE_DIR } from '../../shared/constants';
import { normalizeFsPath, uniqueResolvedPaths } from '../../shared/path';
import type { ProjectSpineCategory } from '../../shared/types';

export async function buildProjectScanPlan(
  projectDir: string,
  categories: ProjectSpineCategory[]
): Promise<{ files: string[]; prefixes: Set<string>; stampParts: string[] }> {
  const prefixes = new Set(categories.map((category) => category.prefix));
  const notesFiles: string[] = [];
  let needsGlobalScan = false;

  for (const category of categories) {
    if (!category.notesFile) {
      needsGlobalScan = true;
      continue;
    }

    const resolved = await resolveCategoryNotesFile(projectDir, category.notesFile);
    if (!resolved) {
      needsGlobalScan = true;
      continue;
    }

    notesFiles.push(resolved);
  }

  let files = uniqueResolvedPaths(notesFiles);
  if (needsGlobalScan || files.length === 0) {
    const discovered = await collectMarkdownFiles(projectDir);
    files = uniqueResolvedPaths([...files, ...discovered]);
  }

  const stampParts = await buildFileStampParts(files);
  return { files, prefixes, stampParts };
}

export async function resolveCategoryNotesFile(projectDir: string, notesFile: string): Promise<string | undefined> {
  const trimmed = notesFile.trim();
  if (!trimmed || path.isAbsolute(trimmed) || /[\\/]/.test(trimmed)) {
    return undefined;
  }

  const candidate = path.join(projectDir, SPINE_DIR, trimmed);
  return (await isFile(candidate)) ? path.resolve(candidate) : undefined;
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

      if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        results.push(fullPath);
      }
    }
  }

  results.sort((a, b) => a.localeCompare(b));
  return results;
}

export async function collectReferenceMarkdownFiles(projectDir: string): Promise<string[]> {
  const roots = [
    path.join(projectDir, 'manuscript'),
    path.join(projectDir, 'manuscripts'),
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

export async function collectManuscriptMarkdownFiles(projectDir: string): Promise<string[]> {
  const roots = [
    path.join(projectDir, 'manuscript'),
    path.join(projectDir, 'manuscripts')
  ];

  const files: string[] = [];
  for (const root of roots) {
    if (!(await isDirectory(root))) {
      continue;
    }

    const discovered = await collectMarkdownFiles(root);
    files.push(...discovered);
  }

  return uniqueResolvedPaths(files);
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

export async function resolveCurrentSpineCategoryFile(
  projectDir: string,
  categories: ProjectSpineCategory[],
  currentFilePath: string
): Promise<ProjectSpineCategory | undefined> {
  const normalizedCurrent = normalizeFsPath(path.resolve(currentFilePath));
  for (const category of categories) {
    if (!category.notesFile) {
      continue;
    }

    const resolved = await resolveCategoryNotesFile(projectDir, category.notesFile);
    if (!resolved) {
      continue;
    }

    if (normalizeFsPath(resolved) === normalizedCurrent) {
      return category;
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

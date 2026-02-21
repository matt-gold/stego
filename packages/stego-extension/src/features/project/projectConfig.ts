import * as path from 'path';
import { promises as fs } from 'fs';
import * as vscode from 'vscode';
import { normalizeFsPath } from '../../shared/path';
import { asString } from '../../shared/value';
import type { ProjectBibleCategory, ProjectScanContext, ProjectStructuralLevel } from '../../shared/types';

const RESERVED_COMMENT_PREFIX = 'CMT';

export async function findNearestProjectConfig(
  documentPath: string,
  workspaceRoot: string
): Promise<ProjectScanContext | undefined> {
  let current = path.dirname(path.resolve(documentPath));
  const root = path.resolve(workspaceRoot);

  while (true) {
    const candidate = path.join(current, 'project.json');
    const context = await readProjectConfig(candidate);
    if (context) {
      return context;
    }

    if (normalizeFsPath(current) === normalizeFsPath(root)) {
      return undefined;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }

    current = parent;
  }
}

export async function readProjectConfig(projectFilePath: string): Promise<ProjectScanContext | undefined> {
  try {
    const stat = await fs.stat(projectFilePath);
    if (!stat.isFile()) {
      return undefined;
    }

    const raw = await fs.readFile(projectFilePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    const structuralLevels = extractProjectStructuralLevels(parsed);
    const structuralKeys = extractProjectStructuralKeysFromLevels(structuralLevels);
    const requiredMetadata = extractProjectRequiredMetadata(parsed);
    const categories = extractProjectCategories(parsed);

    return {
      projectDir: path.dirname(projectFilePath),
      projectMtimeMs: stat.mtimeMs,
      structuralKeys,
      structuralLevels,
      requiredMetadata,
      categories
    };
  } catch {
    return undefined;
  }
}

export function extractProjectRequiredMetadata(parsed: unknown): string[] {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return [];
  }

  const record = parsed as Record<string, unknown>;
  const raw = record.requiredMetadata;
  if (!Array.isArray(raw)) {
    return [];
  }

  const result: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const key = asString(entry);
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(key);
  }

  return result;
}

export function extractProjectStructuralLevels(parsed: unknown): ProjectStructuralLevel[] {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return [];
  }

  const record = parsed as Record<string, unknown>;
  const compileStructure = record.compileStructure;
  if (!compileStructure || typeof compileStructure !== 'object' || Array.isArray(compileStructure)) {
    return [];
  }

  const levels = (compileStructure as Record<string, unknown>).levels;
  if (!Array.isArray(levels)) {
    return [];
  }

  const parsedLevels: ProjectStructuralLevel[] = [];
  const seen = new Set<string>();

  for (const level of levels) {
    if (!level || typeof level !== 'object' || Array.isArray(level)) {
      continue;
    }

    const levelRecord = level as Record<string, unknown>;
    const key = asString(levelRecord.key);
    const label = asString(levelRecord.label);
    if (!key || !/^[A-Za-z0-9_-]+$/.test(key) || !label) {
      continue;
    }

    if (seen.has(key)) {
      continue;
    }

    const titleKey = asString(levelRecord.titleKey);
    if (titleKey && !/^[A-Za-z0-9_-]+$/.test(titleKey)) {
      continue;
    }

    const headingTemplateRaw = asString(levelRecord.headingTemplate);
    const headingTemplate = headingTemplateRaw && headingTemplateRaw.trim().length > 0
      ? headingTemplateRaw.trim()
      : '{label} {value}: {title}';

    seen.add(key);
    parsedLevels.push({
      key,
      label,
      titleKey: titleKey || undefined,
      headingTemplate
    });
  }

  return parsedLevels;
}

export function extractProjectStructuralKeysFromLevels(levels: ProjectStructuralLevel[]): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();

  for (const level of levels) {
    if (!seen.has(level.key)) {
      seen.add(level.key);
      keys.push(level.key);
    }

    if (level.titleKey && !seen.has(level.titleKey)) {
      seen.add(level.titleKey);
      keys.push(level.titleKey);
    }
  }

  return keys;
}

export function extractProjectCategories(parsed: unknown): ProjectBibleCategory[] {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return [];
  }

  const record = parsed as Record<string, unknown>;
  if (!Array.isArray(record.bibleCategories)) {
    return [];
  }

  const categories: ProjectBibleCategory[] = [];
  const seenPrefixes = new Set<string>();

  for (const item of record.bibleCategories) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }

    const category = item as Record<string, unknown>;
    const key = asString(category.key);
    if (!key || !/^[A-Za-z0-9_-]+$/.test(key)) {
      continue;
    }

    const prefix = asString(category.prefix)?.toUpperCase();
    if (!prefix || !/^[A-Z][A-Z0-9]*$/.test(prefix)) {
      continue;
    }

    if (prefix === RESERVED_COMMENT_PREFIX) {
      continue;
    }

    if (seenPrefixes.has(prefix)) {
      continue;
    }

    seenPrefixes.add(prefix);
    categories.push({
      key,
      prefix,
      notesFile: asString(category.notesFile)
    });
  }

  return categories;
}

export function getConfig(section: 'bible' | 'editor' | 'comments', scopeUri?: vscode.Uri): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration(`stego.${section}`, scopeUri);
}

export function getResolvedIndexPath(folder: vscode.WorkspaceFolder): string | undefined {
  const config = getConfig('bible', folder.uri);
  const configuredPath = config.get<string>('indexFile', '.stego/bible-index.json').trim();
  if (!configuredPath) {
    return undefined;
  }

  return path.isAbsolute(configuredPath) ? configuredPath : path.join(folder.uri.fsPath, configuredPath);
}

export async function findNearestFileUpward(
  documentPath: string,
  workspaceRoot: string,
  fileName: string
): Promise<string | undefined> {
  let current = path.dirname(path.resolve(documentPath));
  const root = path.resolve(workspaceRoot);

  while (true) {
    const candidate = path.join(current, fileName);
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) {
        return candidate;
      }
    } catch {
      // no-op
    }

    if (normalizeFsPath(current) === normalizeFsPath(root)) {
      return undefined;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }

    current = parent;
  }
}

export function isProjectFile(uri: vscode.Uri): boolean {
  return uri.scheme === 'file' && path.basename(uri.fsPath).toLowerCase() === 'project.json';
}

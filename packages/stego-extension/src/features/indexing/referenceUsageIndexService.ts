import * as path from 'path';
import { promises as fs } from 'fs';
import { normalizeFsPath } from '../../shared/path';
import type {
  FileIdentifierUsage,
  IndexedFileUsage,
  ProjectReferenceIndex,
  SidebarBacklink
} from '../../shared/types';
import { compileGlobalRegex } from '../identifiers';
import { collectReferenceMarkdownFiles } from '../project';

export class ReferenceUsageIndexService {
  private readonly cache = new Map<string, ProjectReferenceIndex>();

  public clear(): void {
    this.cache.clear();
  }

  public async getReferencesForIdentifier(
    projectDir: string,
    identifier: string,
    pattern: string,
    excludeFilePath?: string
  ): Promise<SidebarBacklink[]> {
    const grouped = await this.getReferencesForIdentifiers(projectDir, [identifier], pattern, excludeFilePath);
    return grouped.get(identifier) ?? [];
  }

  public async getReferencesForIdentifiers(
    projectDir: string,
    identifiers: string[],
    pattern: string,
    excludeFilePath?: string
  ): Promise<Map<string, SidebarBacklink[]>> {
    const index = await this.loadProjectIndex(projectDir, pattern);
    const results = new Map<string, SidebarBacklink[]>();

    for (const identifier of identifiers) {
      const files = index.byIdentifier.get(identifier);
      if (!files) {
        results.set(identifier, []);
        continue;
      }

      const backlinks: SidebarBacklink[] = [];
      for (const [filePath, usage] of files.entries()) {
        if (excludeFilePath && normalizeFsPath(excludeFilePath) === normalizeFsPath(filePath)) {
          continue;
        }

        backlinks.push({
          filePath,
          fileLabel: path.relative(projectDir, filePath).split(path.sep).join('/'),
          line: usage.firstLine,
          excerpt: usage.firstExcerpt,
          count: usage.count
        });
      }

      backlinks.sort((a, b) => a.filePath.localeCompare(b.filePath));
      results.set(identifier, backlinks);
    }

    return results;
  }

  private async loadProjectIndex(projectDir: string, pattern: string): Promise<ProjectReferenceIndex> {
    const key = path.resolve(projectDir);
    const cached = this.cache.get(key);
    if (!cached || cached.pattern !== pattern) {
      const fresh = await this.buildProjectIndex(projectDir, pattern);
      this.cache.set(key, fresh);
      return fresh;
    }

    await this.refreshProjectIndex(cached, projectDir, pattern);
    return cached;
  }

  private async buildProjectIndex(projectDir: string, pattern: string): Promise<ProjectReferenceIndex> {
    const files = await collectReferenceMarkdownFiles(projectDir);
    const index: ProjectReferenceIndex = {
      pattern,
      files: new Map(),
      byIdentifier: new Map()
    };

    for (const filePath of files) {
      const parsed = await parseFileIdentifierUsage(filePath, pattern);
      if (!parsed) {
        continue;
      }
      index.files.set(filePath, parsed);
      addFileUsageToIndex(index.byIdentifier, filePath, parsed.identifiers);
    }

    return index;
  }

  private async refreshProjectIndex(index: ProjectReferenceIndex, projectDir: string, pattern: string): Promise<void> {
    const files = await collectReferenceMarkdownFiles(projectDir);
    const currentSet = new Set(files.map((entry) => normalizeFsPath(entry)));

    for (const existingPath of [...index.files.keys()]) {
      if (currentSet.has(normalizeFsPath(existingPath))) {
        continue;
      }

      removeFileUsageFromIndex(index.byIdentifier, existingPath, index.files.get(existingPath)?.identifiers);
      index.files.delete(existingPath);
    }

    for (const filePath of files) {
      let stat;
      try {
        stat = await fs.stat(filePath);
      } catch {
        removeFileUsageFromIndex(index.byIdentifier, filePath, index.files.get(filePath)?.identifiers);
        index.files.delete(filePath);
        continue;
      }

      const existing = index.files.get(filePath);
      if (existing && existing.mtimeMs === stat.mtimeMs) {
        continue;
      }

      const parsed = await parseFileIdentifierUsage(filePath, pattern, stat.mtimeMs);
      removeFileUsageFromIndex(index.byIdentifier, filePath, existing?.identifiers);
      if (!parsed) {
        index.files.delete(filePath);
        continue;
      }

      index.files.set(filePath, parsed);
      addFileUsageToIndex(index.byIdentifier, filePath, parsed.identifiers);
    }
  }
}

export async function parseFileIdentifierUsage(
  filePath: string,
  pattern: string,
  knownMtimeMs?: number
): Promise<IndexedFileUsage | undefined> {
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    return undefined;
  }

  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch {
    return undefined;
  }

  const regex = compileGlobalRegex(pattern);
  if (!regex) {
    return {
      mtimeMs: knownMtimeMs ?? stat.mtimeMs,
      identifiers: new Map()
    };
  }

  const identifiers = new Map<string, FileIdentifierUsage>();
  const lines = raw.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const lineText = lines[index];
    regex.lastIndex = 0;
    for (const match of lineText.matchAll(regex)) {
      const token = match[0].toUpperCase();
      const existing = identifiers.get(token);
      if (!existing) {
        identifiers.set(token, {
          count: 1,
          firstLine: index + 1,
          firstExcerpt: summarizeLineForPreview(lineText)
        });
        continue;
      }

      existing.count += 1;
    }
  }

  return {
    mtimeMs: knownMtimeMs ?? stat.mtimeMs,
    identifiers
  };
}

export function summarizeLineForPreview(lineText: string): string {
  const compact = lineText.trim().replace(/\s+/g, ' ');
  if (compact.length <= 120) {
    return compact;
  }
  return `${compact.slice(0, 117)}...`;
}

export function addFileUsageToIndex(
  byIdentifier: Map<string, Map<string, FileIdentifierUsage>>,
  filePath: string,
  identifiers: Map<string, FileIdentifierUsage>
): void {
  for (const [identifier, usage] of identifiers) {
    let files = byIdentifier.get(identifier);
    if (!files) {
      files = new Map();
      byIdentifier.set(identifier, files);
    }

    files.set(filePath, usage);
  }
}

export function removeFileUsageFromIndex(
  byIdentifier: Map<string, Map<string, FileIdentifierUsage>>,
  filePath: string,
  identifiers: Map<string, FileIdentifierUsage> | undefined
): void {
  if (!identifiers) {
    return;
  }

  for (const identifier of identifiers.keys()) {
    const files = byIdentifier.get(identifier);
    if (!files) {
      continue;
    }

    files.delete(filePath);
    if (files.size === 0) {
      byIdentifier.delete(identifier);
    }
  }
}

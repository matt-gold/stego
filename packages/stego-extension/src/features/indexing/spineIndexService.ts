import * as path from 'path';
import { promises as fs } from 'fs';
import * as vscode from 'vscode';
import { slugifyHeading } from '../../shared/markdown';
import { asString } from '../../shared/value';
import { toWorkspacePath } from '../../shared/path';
import { normalizeSpineEntryLabel, parseLeadingSpineEntryLabelLine } from '../../shared/spineEntryMetadata';
import type { SpineRecord } from '../../shared/types';
import { buildProjectScanPlan } from '../project/fileScan';
import { findNearestProjectConfig, getResolvedIndexPath } from '../project/projectConfig';

export class SpineIndexService {
  private readonly explicitCache = new Map<string, { mtimeMs: number; index: Map<string, SpineRecord> }>();
  private readonly inferredCache = new Map<string, { stamp: string; index: Map<string, SpineRecord> }>();

  public clear(): void {
    this.explicitCache.clear();
    this.inferredCache.clear();
  }

  public async loadForDocument(document: vscode.TextDocument): Promise<Map<string, SpineRecord>> {
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!folder) {
      return new Map();
    }

    const explicit = await this.loadExplicitIndex(folder);
    const inferred = await this.loadInferredIndex(document, folder);

    if (explicit.size === 0) {
      return inferred;
    }

    if (inferred.size === 0) {
      return explicit;
    }

    return mergeIndexes(inferred, explicit);
  }

  private async loadExplicitIndex(folder: vscode.WorkspaceFolder): Promise<Map<string, SpineRecord>> {
    const indexPath = getResolvedIndexPath(folder);
    if (!indexPath) {
      return new Map();
    }

    const cacheKey = `${folder.uri.fsPath}::${indexPath}`;
    let stat;

    try {
      stat = await fs.stat(indexPath);
    } catch {
      this.explicitCache.delete(cacheKey);
      return new Map();
    }

    const cached = this.explicitCache.get(cacheKey);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached.index;
    }

    const raw = await fs.readFile(indexPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    const index = parseIndexFile(parsed);

    this.explicitCache.set(cacheKey, { mtimeMs: stat.mtimeMs, index });
    return index;
  }

  private async loadInferredIndex(
    document: vscode.TextDocument,
    folder: vscode.WorkspaceFolder
  ): Promise<Map<string, SpineRecord>> {
    const project = await findNearestProjectConfig(document.uri.fsPath, folder.uri.fsPath);
    if (!project || project.categories.length === 0) {
      return new Map();
    }

    const scanPlan = await buildProjectScanPlan(project.projectDir, project.categories);
    if (scanPlan.files.length === 0) {
      return new Map();
    }

    const cacheKey = project.projectDir;
    const stamp = [project.projectMtimeMs.toString(), ...scanPlan.stampParts].join('|');
    const cached = this.inferredCache.get(cacheKey);
    if (cached && cached.stamp === stamp) {
      return cached.index;
    }

    const index = await buildIndexFromHeadingScan(scanPlan.files, scanPlan.prefixes, folder.uri.fsPath);
    this.inferredCache.set(cacheKey, { stamp, index });
    return index;
  }
}

export function parseIndexFile(parsed: unknown): Map<string, SpineRecord> {
  const index = new Map<string, SpineRecord>();

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return index;
  }

  for (const [id, value] of Object.entries(parsed)) {
    if (typeof value === 'string') {
      index.set(id, { description: value });
      continue;
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      continue;
    }

    const record = value as Record<string, unknown>;
    index.set(id, {
      label: normalizeSpineEntryLabel(asString(record.label)),
      title: asString(record.title),
      description: asString(record.description),
      url: asString(record.url),
      path: asString(record.path),
      anchor: asString(record.anchor)
    });
  }

  return index;
}

export function mergeIndexes(base: Map<string, SpineRecord>, overrides: Map<string, SpineRecord>): Map<string, SpineRecord> {
  const merged = new Map(base);

  for (const [id, record] of overrides) {
    const existing = merged.get(id);
    merged.set(id, existing ? mergeSpineRecord(existing, record) : record);
  }

  return merged;
}

export function mergeSpineRecord(base: SpineRecord, override: SpineRecord): SpineRecord {
  return {
    label: override.label ?? base.label,
    title: override.title ?? base.title,
    description: override.description ?? base.description,
    url: override.url ?? base.url,
    path: override.path ?? base.path,
    anchor: override.anchor ?? base.anchor
  };
}

export async function buildIndexFromHeadingScan(
  files: string[],
  prefixes: Set<string>,
  workspaceRoot: string
): Promise<Map<string, SpineRecord>> {
  const index = new Map<string, SpineRecord>();

  for (const filePath of files) {
    let raw: string;
    try {
      raw = await fs.readFile(filePath, 'utf8');
    } catch {
      continue;
    }

    const lines = raw.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const headingMatch = lines[i].match(/^#{1,3}\s+(.+?)\s*$/);
      if (!headingMatch) {
        continue;
      }

      const headingText = headingMatch[1].trim();
      const idMatch = headingText.match(/^([A-Za-z][A-Za-z0-9]*-[A-Za-z0-9][A-Za-z0-9-]*)\b/);
      if (!idMatch) {
        continue;
      }

      const id = idMatch[1].toUpperCase();
      const dashIndex = id.indexOf('-');
      if (dashIndex <= 0) {
        continue;
      }

      const prefix = id.slice(0, dashIndex);
      if (!prefixes.has(prefix) || index.has(id)) {
        continue;
      }

      const headingRemainder = headingText
        .slice(idMatch[1].length)
        .trim()
        .replace(/^[-:]\s*/, '');
      const label = extractHeadingLabel(lines, i + 1);
      const description = extractHeadingDescription(lines, i + 1);
      const anchor = slugifyHeading(headingText);
      const pathValue = toWorkspacePath(workspaceRoot, filePath);

      index.set(id, {
        label,
        title: headingRemainder || id,
        description,
        path: pathValue,
        anchor
      });
    }
  }

  return index;
}

export function extractHeadingLabel(lines: string[], startLine: number): string | undefined {
  for (let i = startLine; i < lines.length; i += 1) {
    const raw = lines[i].trim();
    if (!raw) {
      continue;
    }

    if (/^#{1,6}\s/.test(raw)) {
      break;
    }

    if (raw.startsWith('<!--')) {
      continue;
    }

    return parseLeadingSpineEntryLabelLine(raw);
  }

  return undefined;
}

export function extractHeadingDescription(lines: string[], startLine: number): string | undefined {
  let seenFirstContentLine = false;

  for (let i = startLine; i < lines.length; i += 1) {
    const raw = lines[i].trim();
    if (!raw) {
      continue;
    }

    if (/^#{1,6}\s/.test(raw)) {
      break;
    }

    if (raw.startsWith('<!--')) {
      continue;
    }

    if (!seenFirstContentLine) {
      seenFirstContentLine = true;
      if (parseLeadingSpineEntryLabelLine(raw)) {
        continue;
      }
    }

    const cleaned = raw
      .replace(/^\s*[-*+]\s+/, '')
      .replace(/^>\s?/, '')
      .trim();
    if (!cleaned) {
      continue;
    }

    if (cleaned.length <= 220) {
      return cleaned;
    }

    return `${cleaned.slice(0, 217)}...`;
  }

  return undefined;
}

export function resolveRecordPathToFile(recordPath: string | undefined, workspaceRoot: string | undefined): string | undefined {
  if (!recordPath) {
    return undefined;
  }

  if (/^(https?:)?\/\//i.test(recordPath)) {
    return undefined;
  }

  const trimmed = recordPath.trim();
  if (!trimmed) {
    return undefined;
  }

  return path.isAbsolute(trimmed)
    ? path.resolve(trimmed)
    : workspaceRoot
      ? path.resolve(path.join(workspaceRoot, trimmed))
      : undefined;
}

import * as path from 'path';
import { promises as fs } from 'fs';
import * as vscode from 'vscode';
import { slugifyHeading } from '../../shared/markdown';
import { toWorkspacePath } from '../../shared/path';
import { parseLeadingSpineEntryLabelLine } from '../../shared/spineEntryMetadata';
import type { ProjectSpineCategory, SpineRecord } from '../../shared/types';
import { parseMarkdownDocument } from '../metadata';
import { buildProjectScanPlan, findNearestProjectConfig } from '../project';

export class SpineIndexService {
  private readonly inferredCache = new Map<string, { stamp: string; index: Map<string, SpineRecord> }>();

  public clear(): void {
    this.inferredCache.clear();
  }

  public async loadForDocument(document: vscode.TextDocument): Promise<Map<string, SpineRecord>> {
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!folder) {
      return new Map();
    }

    return this.loadInferredIndex(document, folder);
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

    const index = await buildIndexFromHeadingScan(
      scanPlan.files,
      scanPlan.prefixes,
      folder.uri.fsPath,
      project.projectDir,
      project.categories
    );
    this.inferredCache.set(cacheKey, { stamp, index });
    return index;
  }
}

export async function buildIndexFromHeadingScan(
  files: string[],
  prefixes: Set<string>,
  workspaceRoot: string,
  projectRoot: string,
  categories: ProjectSpineCategory[]
): Promise<Map<string, SpineRecord>> {
  const index = new Map<string, SpineRecord>();
  const categoriesByKey = new Map<string, ProjectSpineCategory>();
  for (const category of categories) {
    categoriesByKey.set(category.key.trim().toLowerCase(), category);
  }

  for (const filePath of files) {
    let raw: string;
    try {
      raw = await fs.readFile(filePath, 'utf8');
    } catch {
      continue;
    }

    const lines = raw.split(/\r?\n/);
    let foundIdentifierHeading = false;
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
      foundIdentifierHeading = true;

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

    if (foundIdentifierHeading) {
      continue;
    }

    const fallback = buildFallbackSpineRecord(
      filePath,
      raw,
      workspaceRoot,
      projectRoot,
      categoriesByKey,
      prefixes
    );
    if (!fallback) {
      continue;
    }

    const uniqueId = nextAvailableId(index, fallback.id);
    index.set(uniqueId, fallback.record);
  }

  return index;
}

type FallbackSpineRecord = {
  id: string;
  record: SpineRecord;
};

function buildFallbackSpineRecord(
  filePath: string,
  raw: string,
  workspaceRoot: string,
  projectRoot: string,
  categoriesByKey: Map<string, ProjectSpineCategory>,
  prefixes: Set<string>
): FallbackSpineRecord | undefined {
  const relativeToProject = toWorkspacePath(projectRoot, filePath);
  const match = relativeToProject.match(/^spine\/([^/]+)\/(.+)\.md$/i);
  if (!match) {
    return undefined;
  }

  const categoryKey = match[1].trim().toLowerCase();
  const entryPath = match[2].trim();
  if (!entryPath || entryPath.toLowerCase() === '_category') {
    return undefined;
  }

  const category = categoriesByKey.get(categoryKey);
  const configuredPrefix = category?.prefix?.trim().toUpperCase();
  const derivedPrefix = categoryKey.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const prefix = configuredPrefix || derivedPrefix;
  if (!prefix || !prefixes.has(prefix)) {
    return undefined;
  }

  const parsed = tryParseMarkdown(raw);
  const heading = findFirstHeading(parsed.body);
  const labelFromFrontmatter = typeof parsed.frontmatter.label === 'string'
    ? parsed.frontmatter.label.trim()
    : '';
  const fallbackLabel = toDisplayLabelFromEntryPath(entryPath);
  const label = labelFromFrontmatter || heading?.text || fallbackLabel;
  const title = heading?.text || label || fallbackLabel;
  const description = extractHeadingDescription(parsed.bodyLines, heading ? heading.lineIndex + 1 : 0);
  const id = buildFallbackIdentifier(entryPath, prefix);
  const pathValue = toWorkspacePath(workspaceRoot, filePath);

  return {
    id,
    record: {
      label,
      title,
      description,
      path: pathValue,
      anchor: heading ? slugifyHeading(heading.text) : undefined
    }
  };
}

function nextAvailableId(index: Map<string, SpineRecord>, baseId: string): string {
  if (!index.has(baseId)) {
    return baseId;
  }

  let attempt = 2;
  while (index.has(`${baseId}-${attempt}`)) {
    attempt += 1;
  }
  return `${baseId}-${attempt}`;
}

function buildFallbackIdentifier(entryPath: string, prefix: string): string {
  const normalizedEntry = entryPath
    .replace(/\.md$/i, '')
    .replace(/\\/g, '/')
    .trim()
    .toUpperCase();
  if (/^[A-Z][A-Z0-9]*-[A-Z0-9][A-Z0-9-]*$/.test(normalizedEntry)) {
    return normalizedEntry;
  }

  return `${prefix}-${toIdentifierSuffix(entryPath, prefix)}`;
}

function toIdentifierSuffix(entryPath: string, prefix: string): string {
  const withoutExt = entryPath.replace(/\.md$/i, '');
  const normalized = withoutExt
    .split(/[\\/]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => part.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toUpperCase())
    .filter((part) => part.length > 0)
    .join('-');

  if (!normalized) {
    return 'ENTRY';
  }

  const prefixToken = `${prefix.toUpperCase()}-`;
  if (normalized.startsWith(prefixToken) && normalized.length > prefixToken.length) {
    return normalized.slice(prefixToken.length);
  }

  return normalized;
}

function toDisplayLabelFromEntryPath(entryPath: string): string {
  const withoutExt = entryPath.replace(/\.md$/i, '');
  const leaf = withoutExt.split('/').filter((part) => part.length > 0).pop() ?? withoutExt;
  const normalized = leaf.replace(/[_-]+/g, ' ').trim();
  if (!normalized) {
    return 'Spine Entry';
  }
  return normalized.replace(/\b\w/g, (value) => value.toUpperCase());
}

function findFirstHeading(body: string): { text: string; lineIndex: number } | undefined {
  const lines = body.split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const match = lines[lineIndex].match(/^#{1,6}\s+(.+?)\s*$/);
    if (match) {
      return {
        text: match[1].trim(),
        lineIndex
      };
    }
  }
  return undefined;
}

function tryParseMarkdown(raw: string): { frontmatter: Record<string, unknown>; body: string; bodyLines: string[] } {
  try {
    const parsed = parseMarkdownDocument(raw);
    return {
      frontmatter: parsed.frontmatter,
      body: parsed.body,
      bodyLines: parsed.body.split(/\r?\n/)
    };
  } catch {
    return {
      frontmatter: {},
      body: raw,
      bodyLines: raw.split(/\r?\n/)
    };
  }
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

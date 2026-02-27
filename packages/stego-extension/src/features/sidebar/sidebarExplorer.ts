import * as path from 'path';
import { promises as fs } from 'fs';
import * as vscode from 'vscode';
import { uniqueResolvedPaths } from '../../shared/path';
import { parseLeadingSpineEntryLabelLine } from '../../shared/spineEntryMetadata';
import type {
  SpineRecord,
  SpineSectionPreview,
  ProjectSpineCategory,
  ProjectScanContext,
  SidebarExplorerCategoryItem,
  SidebarExplorerCategorySummary
} from '../../shared/types';
import { getIdentifierPrefix, tryParseIdentifierFromHeading } from '../identifiers/collectIdentifiers';
import { resolveCategoryNotesFile } from '../project/fileScan';
import { resolveRecordPathToFile } from '../indexing/spineIndexService';

export function collectExplorerCategorySummaries(
  categories: ProjectSpineCategory[],
  index: Map<string, SpineRecord>
): SidebarExplorerCategorySummary[] {
  const countByPrefix = new Map<string, number>();
  for (const id of index.keys()) {
    const prefix = getIdentifierPrefix(id);
    if (!prefix) {
      continue;
    }
    countByPrefix.set(prefix, (countByPrefix.get(prefix) ?? 0) + 1);
  }

  const summaries = categories.map((category) => ({
    key: category.key,
    prefix: category.prefix,
    label: toCategoryLabel(category.key),
    count: countByPrefix.get(category.prefix) ?? 0
  }));

  summaries.sort((a, b) => a.label.localeCompare(b.label));
  return summaries;
}

export function collectExplorerCategoryItems(
  prefix: string,
  index: Map<string, SpineRecord>
): SidebarExplorerCategoryItem[] {
  const normalizedPrefix = prefix.toUpperCase();
  const items: SidebarExplorerCategoryItem[] = [];

  for (const [id, record] of index.entries()) {
    if (!id.startsWith(`${normalizedPrefix}-`)) {
      continue;
    }

    items.push({
      id,
      label: record.label?.trim() || record.title?.trim() || id,
      title: record.title?.trim() || id,
      description: record.description?.trim() || '',
      known: true
    });
  }

  items.sort((a, b) => a.id.localeCompare(b.id));
  return items;
}

export function toCategoryLabel(key: string): string {
  const normalized = key.replace(/[_-]+/g, ' ').trim();
  if (!normalized) {
    return key;
  }
  return normalized.replace(/\b\w/g, (value) => value.toUpperCase());
}

export async function resolveSpineSectionPreview(
  identifier: string,
  record: SpineRecord | undefined,
  document: vscode.TextDocument,
  projectContext: ProjectScanContext | undefined
): Promise<SpineSectionPreview | undefined> {
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  const candidates: string[] = [];

  const fromRecord = resolveRecordPathToFile(record?.path, folder?.uri.fsPath);
  if (fromRecord) {
    candidates.push(fromRecord);
  }

  if (projectContext) {
    const prefix = getIdentifierPrefix(identifier);
    if (prefix) {
      const category = projectContext.categories.find((entry) => entry.prefix === prefix);
      if (category?.notesFile) {
        const notesPath = await resolveCategoryNotesFile(projectContext.projectDir, category.notesFile);
        if (notesPath) {
          candidates.push(notesPath);
        }
      }
    }
  }

  const uniqueCandidates = uniqueResolvedPaths(candidates);
  for (const filePath of uniqueCandidates) {
    const preview = await parseIdentifierSectionFromFile(filePath, identifier, projectContext?.projectDir);
    if (preview) {
      return preview;
    }
  }

  return undefined;
}

export async function parseIdentifierSectionFromFile(
  filePath: string,
  identifier: string,
  projectDir?: string
): Promise<SpineSectionPreview | undefined> {
  if (!filePath.toLowerCase().endsWith('.md')) {
    return undefined;
  }

  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch {
    return undefined;
  }

  const lines = raw.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(#{1,6})\s+(.+?)\s*$/);
    if (!match) {
      continue;
    }

    const heading = match[2].trim();
    const headingIdentifier = tryParseIdentifierFromHeading(heading);
    if (headingIdentifier !== identifier) {
      continue;
    }

    const level = match[1].length;
    const sectionLines = collectHeadingSectionLines(lines, index + 1, level);
    const { label, bodyLines } = extractLeadingSpineEntryLabel(sectionLines);
    const body = compactHeadingSectionBody(bodyLines);
    const fileLabel = projectDir
      ? path.relative(projectDir, filePath).split(path.sep).join('/')
      : filePath;

    return {
      heading,
      label,
      body,
      filePath,
      fileLabel,
      line: index + 1
    };
  }

  return undefined;
}

export function collectHeadingSectionBody(lines: string[], startIndex: number, headingLevel: number): string {
  return compactHeadingSectionBody(collectHeadingSectionLines(lines, startIndex, headingLevel));
}

function collectHeadingSectionLines(lines: string[], startIndex: number, headingLevel: number): string[] {
  const bodyLines: string[] = [];

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (headingMatch && headingMatch[1].length <= headingLevel) {
      break;
    }

    bodyLines.push(line);
  }

  return bodyLines;
}

function extractLeadingSpineEntryLabel(lines: string[]): { label?: string; bodyLines: string[] } {
  const bodyLines = [...lines];
  let firstContentIndex = -1;

  for (let index = 0; index < bodyLines.length; index += 1) {
    const raw = bodyLines[index].trim();
    if (!raw || raw.startsWith('<!--')) {
      continue;
    }
    firstContentIndex = index;
    break;
  }

  if (firstContentIndex < 0) {
    return { bodyLines };
  }

  const label = parseLeadingSpineEntryLabelLine(bodyLines[firstContentIndex]);
  if (!label) {
    return { bodyLines };
  }

  bodyLines.splice(firstContentIndex, 1);
  if (firstContentIndex < bodyLines.length && !bodyLines[firstContentIndex].trim()) {
    bodyLines.splice(firstContentIndex, 1);
  }

  return { label, bodyLines };
}

function compactHeadingSectionBody(lines: string[]): string {
  const bodyLines = [...lines];
  while (bodyLines.length > 0 && !bodyLines[0].trim()) {
    bodyLines.shift();
  }
  while (bodyLines.length > 0 && !bodyLines[bodyLines.length - 1].trim()) {
    bodyLines.pop();
  }

  const compactLines = bodyLines.filter((line) => line.trim().length > 0).slice(0, 10);
  if (compactLines.length === 0) {
    return '';
  }

  return compactLines.join('\n');
}

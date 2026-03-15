import * as path from 'path';
import { promises as fs } from 'fs';
import * as vscode from 'vscode';
import { buildBranchKey, BRANCH_FILENAME } from '@stego-labs/shared/domain/content';
import { CONTENT_DIR } from '../../../../shared/constants';
import { uniqueResolvedPaths } from '../../../../shared/path';
import { parseLeadingLeafLabelLine } from '../../../../shared/leafLabel';
import type {
  LeafTargetRecord,
  LeafSectionPreview,
  ProjectBranch,
  ProjectScanContext,
  SidebarExplorerBranchSummary,
  SidebarExplorerLeafItem
} from '../../../../shared/types';
import { tryParseIdentifierFromHeading } from '../../../identifiers';
import { resolveRecordPathToFile } from '../../../indexing';

export function collectExplorerBranchSummaries(
  branches: ProjectBranch[],
  index: Map<string, LeafTargetRecord>,
  projectDir: string,
  parentKey?: string
): SidebarExplorerBranchSummary[] {
  return branches
    .filter((branch) => branch.parentKey === parentKey)
    .map((branch) => toBranchSummary(branch, index, projectDir))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function collectExplorerLeafItems(
  branchKey: string,
  index: Map<string, LeafTargetRecord>,
  projectDir: string
): SidebarExplorerLeafItem[] {
  const contentRoot = path.join(projectDir, CONTENT_DIR);
  const items: SidebarExplorerLeafItem[] = [];

  for (const [id, record] of index.entries()) {
    const filePath = resolveRecordPathToFile(record.path, vscode.workspace.workspaceFolders?.[0]?.uri.fsPath);
    if (!filePath) {
      continue;
    }
    const recordBranchKey = buildBranchKey(contentRoot, path.dirname(filePath));
    if (recordBranchKey !== branchKey) {
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

  return items.sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
}

export async function resolveLeafSectionPreview(
  identifier: string,
  record: LeafTargetRecord | undefined,
  _document: vscode.TextDocument,
  _projectContext: ProjectScanContext | undefined
): Promise<LeafSectionPreview | undefined> {
  const folder = vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor?.document.uri ?? vscode.Uri.file('/'));
  const candidates: string[] = [];

  const fromRecord = resolveRecordPathToFile(record?.path, folder?.uri.fsPath);
  if (fromRecord) {
    candidates.push(fromRecord);
  }

  const uniqueCandidates = uniqueResolvedPaths(candidates);
  for (const filePath of uniqueCandidates) {
    const preview = await parseIdentifierSectionFromFile(filePath, identifier);
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
): Promise<LeafSectionPreview | undefined> {
  if (!filePath.toLowerCase().endsWith('.md')) {
    return undefined;
  }

  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch {
    return undefined;
  }

  const fileLabel = projectDir
    ? path.relative(projectDir, filePath).split(path.sep).join('/')
    : filePath;
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
    const { label, bodyLines } = extractLeadingExploreEntryLabel(sectionLines);
    const body = compactHeadingSectionBody(bodyLines);

    return {
      heading,
      label,
      body,
      filePath,
      fileLabel,
      line: index + 1
    };
  }

  if (path.basename(filePath).toLowerCase() === BRANCH_FILENAME) {
    return undefined;
  }

  const fallback = buildWholeFilePreview(raw, filePath);
  if (!fallback) {
    return undefined;
  }

  return {
    heading: fallback.heading,
    label: fallback.label,
    body: fallback.body,
    filePath,
    fileLabel,
    line: fallback.line
  };
}

export function collectHeadingSectionBody(lines: string[], startIndex: number, headingLevel: number): string {
  return compactHeadingSectionBody(collectHeadingSectionLines(lines, startIndex, headingLevel));
}

function toBranchSummary(
  branch: ProjectBranch,
  index: Map<string, LeafTargetRecord>,
  projectDir: string
): SidebarExplorerBranchSummary {
  return {
    key: branch.key,
    name: branch.name,
    label: branch.label,
    parentKey: branch.parentKey,
    directLeafCount: collectExplorerLeafItems(branch.key, index, projectDir).length
  };
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

function extractLeadingExploreEntryLabel(lines: string[]): { label?: string; bodyLines: string[] } {
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

  const label = parseLeadingLeafLabelLine(bodyLines[firstContentIndex]);
  if (!label) {
    return { bodyLines };
  }

  bodyLines.splice(firstContentIndex, 1);
  if (firstContentIndex < bodyLines.length && !bodyLines[firstContentIndex].trim()) {
    bodyLines.splice(firstContentIndex, 1);
  }

  return { label, bodyLines };
}

function buildWholeFilePreview(
  raw: string,
  filePath: string
): { heading: string; label?: string; body: string; line: number } | undefined {
  const { frontmatter, bodyLines, bodyStartLine } = splitFrontmatter(raw);
  const frontmatterLabel = parseFrontmatterLabel(frontmatter);
  const firstHeading = findFirstHeadingInLines(bodyLines);

  if (firstHeading) {
    const sectionLines = collectHeadingSectionLines(bodyLines, firstHeading.index + 1, firstHeading.level);
    const { label, bodyLines: cleanedSectionLines } = extractLeadingExploreEntryLabel(sectionLines);
    return {
      heading: firstHeading.text,
      label: frontmatterLabel || label,
      body: compactHeadingSectionBody(cleanedSectionLines),
      line: bodyStartLine + firstHeading.index + 1
    };
  }

  const firstContentLine = findFirstContentLine(bodyLines);
  if (firstContentLine < 0 && !frontmatterLabel) {
    return undefined;
  }

  return {
    heading: frontmatterLabel || toDisplayLabelFromFilename(filePath),
    label: frontmatterLabel,
    body: compactHeadingSectionBody(bodyLines),
    line: bodyStartLine + (firstContentLine >= 0 ? firstContentLine + 1 : 1)
  };
}

function splitFrontmatter(raw: string): { frontmatter?: string; bodyLines: string[]; bodyStartLine: number } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    return { bodyLines: raw.split(/\r?\n/), bodyStartLine: 1 };
  }

  return {
    frontmatter: match[1],
    bodyLines: raw.slice(match[0].length).split(/\r?\n/),
    bodyStartLine: match[0].split(/\r?\n/).length
  };
}

function parseFrontmatterLabel(frontmatter: string | undefined): string | undefined {
  if (!frontmatter) {
    return undefined;
  }
  const match = frontmatter.match(/(?:^|\n)label:\s*(.+?)\s*(?:\n|$)/);
  return match?.[1]?.trim();
}

function findFirstHeadingInLines(lines: string[]): { index: number; level: number; text: string } | undefined {
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(#{1,6})\s+(.+?)\s*$/);
    if (match) {
      return { index, level: match[1].length, text: match[2].trim() };
    }
  }
  return undefined;
}

function findFirstContentLine(lines: string[]): number {
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (trimmed && !trimmed.startsWith('<!--')) {
      return index;
    }
  }
  return -1;
}

function compactHeadingSectionBody(lines: string[]): string {
  return lines.join('\n').trim();
}

function toDisplayLabelFromFilename(filePath: string): string {
  const stem = path.basename(filePath, path.extname(filePath)).replace(/^\d+[-_]?/, '');
  const normalized = stem.replace(/[-_]+/g, ' ').trim();
  if (!normalized) {
    return path.basename(filePath);
  }
  return normalized.replace(/\b\w/g, (value) => value.toUpperCase());
}

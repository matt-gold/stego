import * as path from 'path';
import { promises as fs } from 'fs';
import * as vscode from 'vscode';
import {
  applyLeafPolicyDefaults,
  collectLeafHeadingTargets,
  findLeafHeadingTarget,
  isValidLeafId,
  resolveLeafBranchId,
  type LeafHeadingTarget
} from '@stego-labs/shared/domain/content';
import type { FrontmatterRecord } from '@stego-labs/shared/domain/frontmatter';
import { toWorkspacePath } from '../../shared/path';
import type { LeafTargetRecord, ProjectScanContext } from '../../shared/types';
import { parseMarkdownDocument } from '../metadata';
import { buildProjectScanPlan, findNearestProjectConfig } from '../project';

export class LeafIndexService {
  private readonly inferredCache = new Map<string, { stamp: string; index: Map<string, LeafTargetRecord> }>();

  public clear(): void {
    this.inferredCache.clear();
  }

  public async loadForDocument(document: vscode.TextDocument): Promise<Map<string, LeafTargetRecord>> {
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!folder) {
      return new Map();
    }

    return this.loadInferredIndex(document, folder);
  }

  private async loadInferredIndex(
    document: vscode.TextDocument,
    folder: vscode.WorkspaceFolder
  ): Promise<Map<string, LeafTargetRecord>> {
    const project = await findNearestProjectConfig(document.uri.fsPath, folder.uri.fsPath);
    if (!project) {
      return new Map();
    }

    const scanPlan = await buildProjectScanPlan(project.projectDir);
    if (scanPlan.files.length === 0) {
      return new Map();
    }

    const cacheKey = project.projectDir;
    const stamp = [project.projectMtimeMs.toString(), ...scanPlan.stampParts].join('|');
    const cached = this.inferredCache.get(cacheKey);
    if (cached && cached.stamp === stamp) {
      return cached.index;
    }

    const index = await buildIndexFromHeadingScan(scanPlan.files, folder.uri.fsPath, project);
    this.inferredCache.set(cacheKey, { stamp, index });
    return index;
  }
}

export async function buildIndexFromHeadingScan(
  files: string[],
  workspaceRoot: string,
  projectContext?: Pick<ProjectScanContext, 'projectDir' | 'branches'>
): Promise<Map<string, LeafTargetRecord>> {
  const index = new Map<string, LeafTargetRecord>();

  for (const filePath of files) {
    let raw: string;
    try {
      raw = await fs.readFile(filePath, 'utf8');
    } catch {
      continue;
    }

    let parsed: ReturnType<typeof parseMarkdownDocument>;
    try {
      parsed = parseMarkdownDocument(raw);
    } catch {
      continue;
    }

    const effectiveFrontmatter = buildEffectiveFrontmatter(parsed.frontmatter, projectContext, filePath);
    const id = typeof effectiveFrontmatter.id === 'string'
      ? effectiveFrontmatter.id.trim().toUpperCase()
      : '';
    if (!isValidLeafId(id) || index.has(id)) {
      continue;
    }

    const format = inferFormatFromPath(filePath);
    const headings = format === 'markdown'
      ? collectLeafHeadingTargets(parsed.body, id)
      : [];
    const label = firstNonEmptyString(effectiveFrontmatter.label);
    const title = firstNonEmptyString(effectiveFrontmatter.title)
      ?? label
      ?? headings[0]?.text
      ?? titleFromFilename(filePath);
    const description = summarizeLeaf(parsed.body, headings);

    index.set(id, {
      label: label ?? title,
      title,
      description,
      path: toWorkspacePath(workspaceRoot, filePath)
    });
  }

  return index;
}

function buildEffectiveFrontmatter(
  frontmatter: Record<string, unknown>,
  projectContext: Pick<ProjectScanContext, 'projectDir' | 'branches'> | undefined,
  filePath: string
): Record<string, unknown> {
  if (!projectContext) {
    return frontmatter;
  }

  const contentRoot = path.join(projectContext.projectDir, 'content');
  const branchId = resolveLeafBranchId(contentRoot, filePath);
  if (branchId == null) {
    return frontmatter;
  }

  const branch = projectContext.branches.find((entry) => entry.id === branchId);
  if (!branch) {
    return frontmatter;
  }

  return applyLeafPolicyDefaults(frontmatter as FrontmatterRecord, branch.effectiveLeafPolicy);
}

function inferFormatFromPath(filePath: string): 'markdown' | 'plaintext' {
  return /\.(md|markdown)$/i.test(filePath) ? 'markdown' : 'plaintext';
}

function firstNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function titleFromFilename(filePath: string): string {
  const stem = path.basename(filePath, path.extname(filePath)).replace(/^\d+[-_]/, '');
  const spaced = stem.replace(/[_-]+/g, ' ').trim();
  if (!spaced) {
    return path.basename(filePath);
  }
  return spaced.replace(/\b\w/g, (value) => value.toUpperCase());
}

function summarizeLeaf(body: string, headings: LeafHeadingTarget[]): string | undefined {
  const lines = body.split(/\r?\n/);
  let start = 0;
  if (headings.length > 0) {
    start = Math.max(headings[0].line - 1, 0);
  }

  const chunks: string[] = [];
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line || line.startsWith('#') || line.startsWith('![') || /^```/.test(line)) {
      if (chunks.length > 0) {
        break;
      }
      continue;
    }
    chunks.push(line);
    if (chunks.join(' ').length >= 180) {
      break;
    }
  }

  if (chunks.length === 0) {
    return undefined;
  }

  const joined = chunks.join(' ').replace(/\s+/g, ' ').trim();
  return joined.length > 180 ? `${joined.slice(0, 177).trimEnd()}...` : joined;
}

export function resolveRecordPathToFile(recordPath: string | undefined, workspaceRoot: string | undefined): string | undefined {
  if (!recordPath) {
    return undefined;
  }

  if (path.isAbsolute(recordPath)) {
    return recordPath;
  }

  if (!workspaceRoot) {
    return undefined;
  }

  return path.join(workspaceRoot, recordPath);
}

export function resolveLeafHeadingAnchor(
  fileBody: string,
  headingText: string
): string | undefined {
  const { target } = findLeafHeadingTarget(collectLeafHeadingTargets(fileBody, 'LEAF'), headingText);
  return target?.anchor;
}

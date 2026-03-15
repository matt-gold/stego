import * as path from 'path';
import { promises as fs, type Dirent } from 'fs';
import * as vscode from 'vscode';
import {
  BRANCH_FILENAME,
  buildBranchKey,
  buildBranchLabel,
  buildBranchName,
  buildBranchParentKey,
  parseBranchDocument
} from '@stego-labs/shared/domain/content';
import { CONTENT_DIR } from '../../shared/constants';
import { normalizeFsPath } from '../../shared/path';
import { isValidMetadataKey } from '@stego-labs/shared/domain/frontmatter';
import type {
  ImageStyle,
  ProjectBranch,
  ProjectConfigIssue,
  ProjectScanContext
} from '../../shared/types';
import { parseProjectImageDefaults } from '../metadata';

export const PROJECT_HEALTH_CHANNEL = 'Stego Project Health';

const PROJECT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', optional: true },
    name: { type: 'string', optional: true },
    requiredMetadata: { type: 'array<string>', optional: true },
    images: { type: 'object', optional: true }
  }
} as const;

let projectHealthOutput: vscode.OutputChannel | undefined;
const lastProjectIssueStampByFile = new Map<string, string>();

function getProjectHealthOutputChannel(): vscode.OutputChannel {
  if (!projectHealthOutput) {
    projectHealthOutput = vscode.window.createOutputChannel(PROJECT_HEALTH_CHANNEL);
  }

  return projectHealthOutput;
}

function issue(pathValue: string, message: string): ProjectConfigIssue {
  return { path: pathValue, message };
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function logProjectHealthLines(lines: string[]): void {
  if (lines.length === 0) {
    return;
  }

  const output = getProjectHealthOutputChannel();
  for (const line of lines) {
    output.appendLine(line);
  }
}

function issueStamp(issues: ProjectConfigIssue[]): string {
  return issues
    .map((entry) => `${entry.path}::${entry.message}`)
    .sort((a, b) => a.localeCompare(b))
    .join('\n');
}

function dedupeIssues(issues: ProjectConfigIssue[]): ProjectConfigIssue[] {
  const seen = new Set<string>();
  const deduped: ProjectConfigIssue[] = [];
  for (const entry of issues) {
    const key = `${entry.path}::${entry.message}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(entry);
  }

  return deduped;
}

function validateProjectJsonSchema(parsed: unknown): { record?: Record<string, unknown>; issues: ProjectConfigIssue[] } {
  const issues: ProjectConfigIssue[] = [];
  const record = asObject(parsed);
  if (!record) {
    issues.push(issue('$', 'Expected stego-project.json to be a JSON object.'));
    return { issues };
  }

  const title = record.title;
  if (title !== undefined && typeof title !== 'string') {
    issues.push(issue('$.title', 'Expected string.'));
  }

  const name = record.name;
  if (name !== undefined && typeof name !== 'string') {
    issues.push(issue('$.name', 'Expected string.'));
  }

  const requiredMetadata = record.requiredMetadata;
  if (requiredMetadata !== undefined && !Array.isArray(requiredMetadata)) {
    issues.push(issue('$.requiredMetadata', 'Expected array of strings.'));
  }

  if (Array.isArray(requiredMetadata)) {
    for (let index = 0; index < requiredMetadata.length; index += 1) {
      if (typeof requiredMetadata[index] !== 'string') {
        issues.push(issue(`$.requiredMetadata[${index}]`, 'Expected string.'));
      }
    }
  }

  if (record.spineCategories !== undefined) {
    issues.push(issue('$.spineCategories', 'Legacy spineCategories is unsupported under the leaf model.'));
  }

  if (record.compileStructure !== undefined) {
    issues.push(issue('$.compileStructure', 'Legacy compileStructure is unsupported. Define build behavior in templates/book.template.tsx.'));
  }

  const images = record.images;
  if (images !== undefined && !asObject(images)) {
    issues.push(issue('$.images', 'Expected object.'));
  }

  return { record, issues };
}

function reportProjectConfigIssues(projectFilePath: string, issues: ProjectConfigIssue[]): void {
  if (issues.length === 0) {
    lastProjectIssueStampByFile.delete(projectFilePath);
    return;
  }

  const stamp = issueStamp(issues);
  if (lastProjectIssueStampByFile.get(projectFilePath) === stamp) {
    return;
  }
  lastProjectIssueStampByFile.set(projectFilePath, stamp);

  const now = new Date().toISOString();
  const lines = [
    `[${now}] [project-config] Validation warnings (${issues.length})`,
    `schema: ${PROJECT_JSON_SCHEMA.type}`,
    `file: ${projectFilePath}`,
    ...issues.map((entry) => ` - ${entry.path}: ${entry.message}`),
    ''
  ];
  logProjectHealthLines(lines);
}

export function logProjectHealthIssue(
  scope: 'project-config' | 'overview',
  headline: string,
  options?: {
    projectFilePath?: string;
    filePath?: string;
    detail?: string;
  }
): void {
  const now = new Date().toISOString();
  const lines = [
    `[${now}] [${scope}] ${headline}`,
    ...(options?.projectFilePath ? [`project: ${options.projectFilePath}`] : []),
    ...(options?.filePath ? [`file: ${options.filePath}`] : []),
    ...(options?.detail ? [`detail: ${options.detail}`] : []),
    ''
  ];
  logProjectHealthLines(lines);
}

export async function findNearestProjectConfig(
  documentPath: string,
  workspaceRoot: string
): Promise<ProjectScanContext | undefined> {
  let current = path.dirname(path.resolve(documentPath));
  const root = path.resolve(workspaceRoot);

  while (true) {
    const candidate = path.join(current, 'stego-project.json');
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
  let stat;
  try {
    stat = await fs.stat(projectFilePath);
  } catch {
    lastProjectIssueStampByFile.delete(projectFilePath);
    return undefined;
  }

  if (!stat.isFile()) {
    lastProjectIssueStampByFile.delete(projectFilePath);
    return undefined;
  }

  const issues: ProjectConfigIssue[] = [];
  let parsedRecord: Record<string, unknown> | undefined;

  try {
    const raw = await fs.readFile(projectFilePath, 'utf8');
    try {
      const parsed = JSON.parse(raw) as unknown;
      const validation = validateProjectJsonSchema(parsed);
      parsedRecord = validation.record;
      issues.push(...validation.issues);
    } catch (error) {
      issues.push(issue('$', 'Invalid JSON.'));
      logProjectHealthIssue('project-config', 'Failed to parse stego-project.json as JSON.', {
        projectFilePath,
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  } catch (error) {
    issues.push(issue('$', 'Could not read stego-project.json.'));
    logProjectHealthIssue('project-config', 'Failed to read stego-project.json.', {
      projectFilePath,
      detail: error instanceof Error ? error.message : String(error)
    });
  }

  const source = parsedRecord ?? {};
  const projectTitle = extractProjectTitle(source, issues);
  const requiredMetadata = extractProjectRequiredMetadata(source, issues);
  const imageDefaults = extractProjectImageDefaults(source);
  const branches = await discoverProjectBranches(path.dirname(projectFilePath), issues);
  const dedupedIssues = dedupeIssues(issues);

  reportProjectConfigIssues(projectFilePath, dedupedIssues);

  return {
    projectDir: path.dirname(projectFilePath),
    projectMtimeMs: stat.mtimeMs,
    projectTitle,
    requiredMetadata,
    imageDefaults,
    branches,
    issues: dedupedIssues
  };
}

export function extractProjectImageDefaults(parsed: unknown): ImageStyle {
  return parseProjectImageDefaults(parsed);
}

export function extractProjectTitle(parsed: unknown, issues?: ProjectConfigIssue[]): string | undefined {
  const record = asObject(parsed);
  if (!record) {
    if (issues) {
      issues.push(issue('$', 'Expected object for title extraction.'));
    }
    return undefined;
  }

  const title = asTrimmedString(record.title);
  if (title) {
    return title;
  }

  const name = asTrimmedString(record.name);
  if (name) {
    return name;
  }

  if (record.title !== undefined && typeof record.title !== 'string' && issues) {
    issues.push(issue('$.title', 'Ignored non-string title.'));
  }
  if (record.name !== undefined && typeof record.name !== 'string' && issues) {
    issues.push(issue('$.name', 'Ignored non-string name.'));
  }
  return undefined;
}

export function extractProjectRequiredMetadata(parsed: unknown, issues?: ProjectConfigIssue[]): string[] {
  const record = asObject(parsed);
  if (!record) {
    return [];
  }

  const raw = record.requiredMetadata;
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw)) {
    if (issues) {
      issues.push(issue('$.requiredMetadata', 'Ignored non-array requiredMetadata.'));
    }
    return [];
  }

  const result: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < raw.length; index += 1) {
    const entry = raw[index];
    const key = asTrimmedString(entry);
    if (!key) {
      if (issues) {
        issues.push(issue(`$.requiredMetadata[${index}]`, 'Ignored empty/non-string metadata key.'));
      }
      continue;
    }

    if (!isValidMetadataKey(key)) {
      if (issues) {
        issues.push(issue(`$.requiredMetadata[${index}]`, `Ignored invalid metadata key '${key}'.`));
      }
      continue;
    }

    if (seen.has(key)) {
      if (issues) {
        issues.push(issue(`$.requiredMetadata[${index}]`, `Ignored duplicate metadata key '${key}'.`));
      }
      continue;
    }

    seen.add(key);
    result.push(key);
  }

  return result;
}

async function discoverProjectBranches(
  projectDir: string,
  issues?: ProjectConfigIssue[]
): Promise<ProjectBranch[]> {
  const contentDir = path.join(projectDir, CONTENT_DIR);
  try {
    const stat = await fs.stat(contentDir);
    if (!stat.isDirectory()) {
      return [];
    }
  } catch {
    return [];
  }

  const branches: ProjectBranch[] = [];
  const stack = [contentDir];
  while (stack.length > 0) {
    const currentDir = stack.pop();
    if (!currentDir) {
      continue;
    }

    const key = buildBranchKey(contentDir, currentDir);
    const name = key ? buildBranchName(currentDir) : 'content';
    const notesFilePath = path.join(currentDir, BRANCH_FILENAME);
    let label = key ? buildBranchLabel(name) : 'Content';
    let body: string | undefined;
    let notesFile: string | undefined;

    try {
      const raw = await fs.readFile(notesFilePath, 'utf8');
      const parsed = parseBranchDocument(raw, path.relative(projectDir, notesFilePath));
      label = buildBranchLabel(name, parsed.metadata.label);
      body = parsed.body || undefined;
      notesFile = path.relative(contentDir, notesFilePath).split(path.sep).join('/');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT' && issues) {
        issues.push(issue(path.relative(projectDir, notesFilePath), message));
      }
    }

    branches.push({
      key,
      name,
      label,
      parentKey: buildBranchParentKey(key),
      relativeDir: path.relative(projectDir, currentDir).split(path.sep).join('/'),
      notesFile,
      body
    });

    let entries: Dirent[];
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        stack.push(path.join(currentDir, entry.name));
      }
    }
  }

  return branches.sort((a, b) => {
    const depthA = a.key ? a.key.split('/').length : 0;
    const depthB = b.key ? b.key.split('/').length : 0;
    return depthA - depthB || a.key.localeCompare(b.key);
  });
}

export function getConfig(section: 'links' | 'editor' | 'comments', scopeUri?: vscode.Uri): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration(`stego.${section}`, scopeUri);
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
  return uri.scheme === 'file' && path.basename(uri.fsPath).toLowerCase() === 'stego-project.json';
}

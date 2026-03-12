import * as path from 'path';
import { promises as fs, type Dirent } from 'fs';
import * as vscode from 'vscode';
import { normalizeFsPath } from '../../shared/path';
import { isValidMetadataKey } from '@stego/shared/domain/frontmatter';
import type {
  ImageStyle,
  ProjectSpineCategory,
  ProjectConfigIssue,
  ProjectScanContext,
  ProjectStructuralLevel
} from '../../shared/types';
import { parseProjectImageDefaults } from '../metadata';

export const PROJECT_HEALTH_CHANNEL = 'Stego Project Health';

const PROJECT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', optional: true },
    name: { type: 'string', optional: true },
    requiredMetadata: { type: 'array<string>', optional: true },
    images: { type: 'object', optional: true },
    compileStructure: { type: 'object', optional: true }
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
    issues.push(issue('$.spineCategories', 'Legacy spineCategories is unsupported in Spine V2. Use spine/<category>/ directories.'));
  }

  const compileStructure = record.compileStructure;
  if (compileStructure !== undefined && !asObject(compileStructure)) {
    issues.push(issue('$.compileStructure', 'Expected object.'));
  }

  const images = record.images;
  if (images !== undefined && !asObject(images)) {
    issues.push(issue('$.images', 'Expected object.'));
  }

  if (compileStructure !== undefined) {
    const structureRecord = asObject(compileStructure);
    if (structureRecord) {
      const levels = structureRecord.levels;
      if (levels !== undefined && !Array.isArray(levels)) {
        issues.push(issue('$.compileStructure.levels', 'Expected array of objects.'));
      }

      if (Array.isArray(levels)) {
        for (let index = 0; index < levels.length; index += 1) {
          if (!asObject(levels[index])) {
            issues.push(issue(`$.compileStructure.levels[${index}]`, 'Expected object.'));
          }
        }
      }
    }
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
  const structuralLevels = extractProjectStructuralLevels(source, issues);
  const structuralKeys = extractProjectStructuralKeysFromLevels(structuralLevels);
  const requiredMetadata = extractProjectRequiredMetadata(source, issues);
  const imageDefaults = extractProjectImageDefaults(source);
  const categories = await discoverProjectCategories(path.dirname(projectFilePath), requiredMetadata, issues);
  const dedupedIssues = dedupeIssues(issues);

  reportProjectConfigIssues(projectFilePath, dedupedIssues);

  return {
    projectDir: path.dirname(projectFilePath),
    projectMtimeMs: stat.mtimeMs,
    projectTitle,
    structuralKeys,
    structuralLevels,
    requiredMetadata,
    imageDefaults,
    categories,
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

export function extractProjectStructuralLevels(parsed: unknown, issues?: ProjectConfigIssue[]): ProjectStructuralLevel[] {
  const record = asObject(parsed);
  if (!record) {
    return [];
  }

  const compileStructure = record.compileStructure;
  if (compileStructure === undefined) {
    return [];
  }
  const compileRecord = asObject(compileStructure);
  if (!compileRecord) {
    if (issues) {
      issues.push(issue('$.compileStructure', 'Ignored non-object compileStructure.'));
    }
    return [];
  }

  const levels = compileRecord.levels;
  if (levels === undefined) {
    return [];
  }
  if (!Array.isArray(levels)) {
    if (issues) {
      issues.push(issue('$.compileStructure.levels', 'Ignored non-array levels.'));
    }
    return [];
  }

  const parsedLevels: ProjectStructuralLevel[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < levels.length; index += 1) {
    const level = levels[index];
    const levelPath = `$.compileStructure.levels[${index}]`;
    const levelRecord = asObject(level);
    if (!levelRecord) {
      if (issues) {
        issues.push(issue(levelPath, 'Ignored non-object level.'));
      }
      continue;
    }

    const key = asTrimmedString(levelRecord.key);
    const label = asTrimmedString(levelRecord.label);
    if (!key || !isValidMetadataKey(key)) {
      if (issues) {
        issues.push(issue(`${levelPath}.key`, 'Ignored level with invalid key.'));
      }
      continue;
    }
    if (!label) {
      if (issues) {
        issues.push(issue(`${levelPath}.label`, 'Ignored level with missing label.'));
      }
      continue;
    }

    if (seen.has(key)) {
      if (issues) {
        issues.push(issue(`${levelPath}.key`, `Ignored duplicate level key '${key}'.`));
      }
      continue;
    }

    const titleKey = asTrimmedString(levelRecord.titleKey);
    if (titleKey && !isValidMetadataKey(titleKey)) {
      if (issues) {
        issues.push(issue(`${levelPath}.titleKey`, `Ignored invalid titleKey '${titleKey}'.`));
      }
      continue;
    }

    const headingTemplateRaw = levelRecord.headingTemplate;
    if (headingTemplateRaw !== undefined && typeof headingTemplateRaw !== 'string') {
      if (issues) {
        issues.push(issue(`${levelPath}.headingTemplate`, 'Ignored non-string headingTemplate.'));
      }
    }
    const headingTemplate = asTrimmedString(headingTemplateRaw) ?? '{label} {value}: {title}';

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

async function discoverProjectCategories(
  projectDir: string,
  _requiredMetadata: string[],
  issues?: ProjectConfigIssue[]
): Promise<ProjectSpineCategory[]> {
  const spineDir = path.join(projectDir, 'spine');
  let entries: Dirent[];
  try {
    entries = await fs.readdir(spineDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const categories: ProjectSpineCategory[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) {
      continue;
    }

    const key = entry.name.trim().toLowerCase();
    if (!isValidMetadataKey(key)) {
      if (issues) {
        issues.push(issue('spine', `Ignored invalid category directory '${entry.name}'.`));
      }
      continue;
    }

    const categoryDir = path.join(spineDir, entry.name);
    const inferredPrefix = await inferIdentifierPrefixFromCategoryEntries(categoryDir);
    const compact = key.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const fallbackPrefix = compact && /^[A-Z]/.test(compact) ? compact : `CAT${categories.length + 1}`;
    const prefix = inferredPrefix ?? fallbackPrefix;
    categories.push({
      key,
      prefix,
      notesFile: `${key}/_category.md`
    });
  }

  return categories;
}

async function inferIdentifierPrefixFromCategoryEntries(categoryDir: string): Promise<string | undefined> {
  const counts = new Map<string, number>();
  const stack = [categoryDir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    let entries: Dirent[];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        continue;
      }

      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md') || entry.name.toLowerCase() === '_category.md') {
        continue;
      }

      const stem = path.basename(entry.name, '.md').trim();
      const match = stem.match(/^([A-Za-z][A-Za-z0-9]*)-[A-Za-z0-9][A-Za-z0-9-]*$/);
      if (!match) {
        continue;
      }

      const prefix = match[1].toUpperCase();
      counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
    }
  }

  const ranked = [...counts.entries()].sort((a, b) => {
    if (a[1] !== b[1]) {
      return b[1] - a[1];
    }
    return a[0].localeCompare(b[0]);
  });
  return ranked[0]?.[0];
}

export function getConfig(section: 'spine' | 'editor' | 'comments', scopeUri?: vscode.Uri): vscode.WorkspaceConfiguration {
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

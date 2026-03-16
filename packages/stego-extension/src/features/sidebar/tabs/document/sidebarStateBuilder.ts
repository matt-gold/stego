import * as path from 'path';
import * as vscode from 'vscode';
import { buildBranchKey } from '@stego-labs/shared/domain/content';
import { CONTENT_DIR } from '../../../../shared/constants';
import { normalizeLeafLabel } from '../../../../shared/leafLabel';
import type {
  LeafTargetRecord,
  ProjectBranch,
  ProjectScanContext,
  SidebarIdentifierLink,
  SidebarExplorerPage,
  SidebarBacklink,
  SidebarMetadataEntry
} from '../../../../shared/types';
import { extractIdentifierTokensFromValue, tryParseIdentifierFromHeading } from '../../../identifiers';
import { ReferenceUsageIndexService, resolveRecordPathToFile } from '../../../indexing';
import { formatMetadataValue } from '../../../metadata';
import { resolveTarget } from '../../../navigation';
import { applyBacklinkFilter } from './sidebarToc';
import {
  collectExplorerBranchSummaries,
  collectExplorerLeafItems,
  resolveLeafSectionPreview
} from '../explore/sidebarExplorer';
import type { SidebarTocEntry } from '../../../../shared/types';

export function buildMetadataEntry(
  key: string,
  value: unknown,
  isStructural: boolean,
  branch: ProjectBranch | undefined,
  index: Map<string, LeafTargetRecord>,
  document: vscode.TextDocument,
  pattern: string
): SidebarMetadataEntry {
  if (Array.isArray(value)) {
    const arrayItems = value.map((item, itemIndex) => ({
      index: itemIndex,
      valueText: formatMetadataValue(item),
      references: buildIdentifierLinksForValue(item, branch, index, document, pattern)
    }));

    return {
      key,
      isStructural,
      isBranch: !!branch,
      isArray: true,
      valueText: '',
      references: [],
      arrayItems
    };
  }

  return {
    key,
    isStructural,
    isBranch: !!branch,
    isArray: false,
    valueText: formatMetadataValue(value),
    references: buildIdentifierLinksForValue(value, branch, index, document, pattern),
    arrayItems: []
  };
}

export function buildIdentifierLinksForValue(
  value: unknown,
  _branch: ProjectBranch | undefined,
  index: Map<string, LeafTargetRecord>,
  document: vscode.TextDocument,
  pattern: string
): SidebarIdentifierLink[] {
  const references: SidebarIdentifierLink[] = [];
  for (const id of extractIdentifierTokensFromValue(value, pattern)) {
    const record = index.get(id);
    references.push({
      id,
      title: record?.title ?? '',
      description: record?.description ?? '',
      known: !!record,
      target: resolveTarget(id, record, document)?.toString()
    });
  }

  return references;
}

export async function buildExplorerState(
  document: vscode.TextDocument,
  index: Map<string, LeafTargetRecord>,
  projectContext: ProjectScanContext | undefined,
  pattern: string,
  route: { kind: 'home' } | { kind: 'branch'; id: string } | { kind: 'identifier'; id: string },
  backlinkFilter: string,
  backlinksExpanded: boolean,
  referenceUsageService: ReferenceUsageIndexService
): Promise<SidebarExplorerPage | undefined> {
  const branches = projectContext?.branches ?? [];
  const projectDir = projectContext?.projectDir;
  const rootBranch = branches.find((branch) => branch.id === '');

  if (route.kind === 'home') {
    if (!rootBranch || !projectDir) {
      return undefined;
    }
    return {
      kind: 'home',
      branch: toBranchSummary(rootBranch, branches, index, projectDir),
      childBranches: collectExplorerBranchSummaries(branches, index, projectDir, ''),
      leafItems: collectExplorerLeafItems('', index, projectDir),
      body: rootBranch.body
    };
  }

  if (route.kind === 'branch') {
    if (!projectDir) {
      return undefined;
    }
    const branch = branches.find((entry) => entry.id === route.id);
    if (!branch) {
      return rootBranch
        ? {
          kind: 'home',
          branch: toBranchSummary(rootBranch, branches, index, projectDir),
          childBranches: collectExplorerBranchSummaries(branches, index, projectDir, ''),
          leafItems: collectExplorerLeafItems('', index, projectDir),
          body: rootBranch.body
        }
        : undefined;
    }

    return {
      kind: 'branch',
      branch: toBranchSummary(branch, branches, index, projectDir),
      childBranches: collectExplorerBranchSummaries(branches, index, projectDir, branch.id),
      leafItems: collectExplorerLeafItems(branch.id, index, projectDir),
      body: branch.body
    };
  }

  const id = route.id.trim().toUpperCase();
  if (!id) {
    return undefined;
  }

  const record = index.get(id);
  const section = await resolveLeafSectionPreview(id, record, document, projectContext);
  const title = (record?.title?.trim() || section?.heading?.trim() || id);
  const label = normalizeLeafLabel(record?.label) || normalizeLeafLabel(section?.label) || title || id;
  const description = (record?.description?.trim() || section?.body?.trim() || '');
  const branch = projectContext && projectDir ? findBranchForRecord(projectContext.branches, record, projectDir) : undefined;

  let backlinks: SidebarBacklink[] = [];
  if (projectContext) {
    const allBacklinks = await referenceUsageService.getReferencesForIdentifier(
      projectContext.projectDir,
      id,
      pattern
    );
    backlinks = applyBacklinkFilter(allBacklinks, backlinkFilter);
  }

  return {
    kind: 'identifier',
    branch: branch && projectDir ? toBranchSummary(branch, branches, index, projectDir) : undefined,
    entry: {
      id,
      label,
      known: !!record,
      title,
      description,
      sourceHeading: section?.heading,
      sourceBody: section?.body,
      sourceFilePath: section?.filePath,
      sourceFileLabel: section?.fileLabel,
      sourceLine: section?.line,
      backlinks,
      backlinksExpanded
    }
  };
}

export async function buildTocWithBacklinks(
  tocEntries: SidebarTocEntry[],
  _branchForFile: ProjectBranch | undefined,
  projectContext: ProjectScanContext | undefined,
  document: vscode.TextDocument,
  index: Map<string, LeafTargetRecord>,
  pattern: string,
  backlinkFilter: string,
  expandedTocBacklinks: Set<string>,
  referenceUsageService: ReferenceUsageIndexService
): Promise<SidebarTocEntry[]> {
  if (!projectContext) {
    return tocEntries;
  }

  const filteredEntries: SidebarTocEntry[] = [];
  const tocIdentifiers = tocEntries
    .map((entry) => tryParseIdentifierFromHeading(entry.heading))
    .filter((identifier): identifier is string => !!identifier);
  const backlinksByIdentifier = await referenceUsageService.getReferencesForIdentifiers(
    projectContext.projectDir,
    [...new Set(tocIdentifiers)],
    pattern,
    document.uri.fsPath
  );

  for (const entry of tocEntries) {
    const identifier = tryParseIdentifierFromHeading(entry.heading);
    if (!identifier) {
      filteredEntries.push(entry);
      continue;
    }

    const record = index.get(identifier);
    const backlinks = backlinksByIdentifier.get(identifier) ?? [];
    const filteredBacklinks = applyBacklinkFilter(backlinks, backlinkFilter);

    filteredEntries.push({
      ...entry,
      identifier: {
        id: identifier,
        title: record?.title ?? '',
        description: record?.description ?? '',
        known: !!record,
        target: resolveTarget(identifier, record, document)?.toString()
      },
      backlinkCount: filteredBacklinks.length,
      backlinksExpanded: expandedTocBacklinks.has(identifier),
      backlinks: filteredBacklinks
    });
  }

  return filteredEntries;
}

function findBranchForRecord(
  branches: ProjectBranch[],
  record: LeafTargetRecord | undefined,
  projectDir: string
): ProjectBranch | undefined {
  const filePath = resolveRecordPathToFile(record?.path, vscode.workspace.workspaceFolders?.[0]?.uri.fsPath);
  if (!filePath) {
    return undefined;
  }
  const contentRoot = path.join(projectDir, CONTENT_DIR);
  const branchId = buildBranchKey(contentRoot, path.dirname(filePath));
  return branches.find((branch) => branch.id === branchId);
}

function toBranchSummary(
  branch: ProjectBranch,
  branches: ProjectBranch[],
  index: Map<string, LeafTargetRecord>,
  projectDir: string
) {
  const directBranchCount = branches.filter((candidate) => candidate.parentId === branch.id).length;
  const directLeafCount = collectExplorerLeafItems(branch.id, index, projectDir).length;
  return {
    id: branch.id,
    name: branch.name,
    label: branch.label,
    parentId: branch.parentId,
    directBranchCount,
    directLeafCount,
    directChildCount: directBranchCount + directLeafCount
  };
}

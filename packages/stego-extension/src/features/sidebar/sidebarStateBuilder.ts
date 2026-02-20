import * as vscode from 'vscode';
import type {
  BibleRecord,
  ProjectBibleCategory,
  ProjectScanContext,
  SidebarIdentifierLink,
  SidebarExplorerPage,
  SidebarBacklink,
  SidebarMetadataEntry
} from '../../shared/types';
import { formatMetadataValue } from '../metadata/frontmatterParse';
import { extractIdentifierTokensFromValue, getIdentifierPrefix, tryParseIdentifierFromHeading } from '../identifiers/collectIdentifiers';
import { resolveTarget } from '../navigation/openTargets';
import { ReferenceUsageIndexService } from '../indexing/referenceUsageIndexService';
import { applyBacklinkFilter } from './sidebarToc';
import { collectExplorerCategoryItems, collectExplorerCategorySummaries, resolveBibleSectionPreview } from './sidebarExplorer';
import type { SidebarTocEntry } from '../../shared/types';

export function buildMetadataEntry(
  key: string,
  value: unknown,
  isStructural: boolean,
  category: ProjectBibleCategory | undefined,
  index: Map<string, BibleRecord>,
  document: vscode.TextDocument,
  pattern: string
): SidebarMetadataEntry {
  if (Array.isArray(value)) {
    const arrayItems = value.map((item, itemIndex) => ({
      index: itemIndex,
      valueText: formatMetadataValue(item),
      references: buildIdentifierLinksForValue(item, category, index, document, pattern)
    }));

    return {
      key,
      isStructural,
      isBibleCategory: !!category,
      isArray: true,
      valueText: '',
      references: [],
      arrayItems
    };
  }

  return {
    key,
    isStructural,
    isBibleCategory: !!category,
    isArray: false,
    valueText: formatMetadataValue(value),
    references: buildIdentifierLinksForValue(value, category, index, document, pattern),
    arrayItems: []
  };
}

export function buildIdentifierLinksForValue(
  value: unknown,
  category: ProjectBibleCategory | undefined,
  index: Map<string, BibleRecord>,
  document: vscode.TextDocument,
  pattern: string
): SidebarIdentifierLink[] {
  if (!category) {
    return [];
  }

  const references: SidebarIdentifierLink[] = [];
  for (const id of extractIdentifierTokensFromValue(value, pattern)) {
    if (!id.startsWith(`${category.prefix}-`)) {
      continue;
    }

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
  index: Map<string, BibleRecord>,
  projectContext: ProjectScanContext | undefined,
  pattern: string,
  route: { kind: 'home' } | { kind: 'category'; key: string; prefix: string } | { kind: 'identifier'; id: string },
  backlinkFilter: string,
  backlinksExpanded: boolean,
  referenceUsageService: ReferenceUsageIndexService
): Promise<SidebarExplorerPage | undefined> {
  const categories = collectExplorerCategorySummaries(projectContext?.categories ?? [], index);

  if (route.kind === 'home') {
    return {
      kind: 'home',
      categories
    };
  }

  if (route.kind === 'category') {
    const category = categories.find((entry) => (
      entry.key === route.key
      && entry.prefix.toUpperCase() === route.prefix.toUpperCase()
    ));

    if (!category) {
      return {
        kind: 'home',
        categories
      };
    }

    const items = collectExplorerCategoryItems(route.prefix, index);
    return {
      kind: 'category',
      category,
      items
    };
  }

  const id = route.id.trim().toUpperCase();
  if (!id) {
    return {
      kind: 'home',
      categories
    };
  }

  const record = index.get(id);
  const section = await resolveBibleSectionPreview(id, record, document, projectContext);
  const title = (record?.title?.trim() || section?.heading?.trim() || id);
  const description = (record?.description?.trim() || section?.body?.trim() || '');
  const prefix = getIdentifierPrefix(id);
  const category = prefix
    ? categories.find((entry) => entry.prefix.toUpperCase() === prefix)
    : undefined;

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
    category,
    entry: {
      id,
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
  bibleCategoryForFile: ProjectBibleCategory | undefined,
  projectContext: ProjectScanContext | undefined,
  document: vscode.TextDocument,
  index: Map<string, BibleRecord>,
  pattern: string,
  backlinkFilter: string,
  expandedTocBacklinks: Set<string>,
  referenceUsageService: ReferenceUsageIndexService
): Promise<SidebarTocEntry[]> {
  if (!bibleCategoryForFile || !projectContext) {
    return tocEntries;
  }

  const filteredEntries: SidebarTocEntry[] = [];
  const tocIdentifiers = tocEntries
    .map((entry) => tryParseIdentifierFromHeading(entry.heading))
    .filter((identifier): identifier is string => !!identifier && identifier.startsWith(`${bibleCategoryForFile.prefix}-`));
  const backlinksByIdentifier = await referenceUsageService.getReferencesForIdentifiers(
    projectContext.projectDir,
    [...new Set(tocIdentifiers)],
    pattern,
    document.uri.fsPath
  );

  for (const entry of tocEntries) {
    const identifier = tryParseIdentifierFromHeading(entry.heading);
    if (!identifier || !identifier.startsWith(`${bibleCategoryForFile.prefix}-`)) {
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

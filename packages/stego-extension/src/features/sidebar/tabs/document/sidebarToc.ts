import * as path from 'path';
import * as vscode from 'vscode';
import { MINOR_TITLE_WORDS } from '../../../../shared/constants';
import { slugifyHeading } from '../../../../shared/markdown';
import type { SidebarBacklink, SidebarTocEntry } from '../../../../shared/types';

export function collectTocEntries(document: vscode.TextDocument): SidebarTocEntry[] {
  const entries: SidebarTocEntry[] = [];

  for (let line = 0; line < document.lineCount; line += 1) {
    const text = document.lineAt(line).text;
    const match = text.match(/^(#{1,3})\s+(.+?)\s*$/);
    if (!match) {
      continue;
    }

    const heading = match[2].trim();
    entries.push({
      id: `toc-${line + 1}`,
      level: match[1].length,
      heading,
      line: line + 1,
      anchor: slugifyHeading(heading),
      backlinkCount: 0,
      backlinksExpanded: false,
      backlinks: []
    });
  }

  return entries;
}

export function applyBacklinkFilter(backlinks: SidebarBacklink[], filter: string): SidebarBacklink[] {
  const query = filter.trim().toLowerCase();
  if (!query) {
    return backlinks;
  }

  return backlinks.filter((entry) => (
    entry.fileLabel.toLowerCase().includes(query)
    || entry.filePath.toLowerCase().includes(query)
  ));
}

export function toTitleWord(value: string): string {
  if (!value) {
    return value;
  }

  return `${value.slice(0, 1).toUpperCase()}${value.slice(1).toLowerCase()}`;
}

export function formatTitleWords(words: string[]): string {
  return words.map((word, index) => {
    const lower = word.toLowerCase();
    const isEdge = index === 0 || index === words.length - 1;
    if (!isEdge && MINOR_TITLE_WORDS.has(lower)) {
      return lower;
    }
    return toTitleWord(word);
  }).join(' ');
}

export function getSidebarFileTitle(documentPath: string, preferredTitle?: string): { title: string; filename: string } {
  const filename = path.basename(documentPath || '');
  if (!filename) {
    return { title: '', filename: '' };
  }

  const trimmedPreferredTitle = (preferredTitle ?? '').trim();
  if (trimmedPreferredTitle.length > 0) {
    return { title: trimmedPreferredTitle, filename };
  }

  const extensionIndex = filename.lastIndexOf('.');
  const stem = extensionIndex > 0 ? filename.slice(0, extensionIndex) : filename;
  if (stem === '_branch') {
    const parentName = path.basename(path.dirname(documentPath || ''));
    return { title: parentName || filename, filename };
  }

  const match = stem.match(/^\d+-([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)$/);
  if (!match) {
    return { title: filename, filename };
  }

  const words = match[1]
    .split('-')
    .filter((word) => word.length > 0);
  if (words.length === 0) {
    return { title: filename, filename };
  }

  return {
    title: formatTitleWords(words),
    filename
  };
}

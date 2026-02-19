import * as vscode from 'vscode';
import { DEFAULT_IDENTIFIER_PATTERN } from '../../shared/constants';
import { collectIdentifiers } from './collectIdentifiers';
import { createExploreIdentifierCommandUri } from '../navigation/openTargets';
import { getConfig } from '../project/projectConfig';
import { BibleIndexService } from '../indexing/bibleIndexService';

export function createDocumentLinkProvider(indexService: BibleIndexService): vscode.DocumentLinkProvider {
  return {
    async provideDocumentLinks(document): Promise<vscode.DocumentLink[]> {
      const config = getConfig(document.uri);
      const pattern = config.get<string>('identifierPattern', DEFAULT_IDENTIFIER_PATTERN);
      const includeFences = config.get<boolean>('linkInCodeFences', false);
      const matches = collectIdentifiers(document, pattern, includeFences);
      if (matches.length === 0) {
        return [];
      }

      const index = await indexService.loadForDocument(document);
      const links: vscode.DocumentLink[] = [];

      for (const match of matches) {
        const link = new vscode.DocumentLink(match.range, createExploreIdentifierCommandUri(match.id));
        const record = index.get(match.id);
        if (record?.title) {
          link.tooltip = `${match.id}: ${record.title}`;
        } else {
          link.tooltip = `Explore ${match.id} in Bible sidebar`;
        }
        links.push(link);
      }

      return links;
    }
  };
}

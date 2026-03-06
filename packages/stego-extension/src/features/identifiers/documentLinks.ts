import * as vscode from 'vscode';
import { DEFAULT_IDENTIFIER_PATTERN } from '../../shared/constants';
import { collectIdentifiers } from './collectIdentifiers';
import { isCommentIdentifier, normalizeCommentIdentifier } from '../comments';
import { SpineIndexService } from '../indexing';
import { createExploreIdentifierCommandUri } from '../navigation';
import { getConfig } from '../project';

export function createDocumentLinkProvider(indexService: SpineIndexService): vscode.DocumentLinkProvider {
  return {
    async provideDocumentLinks(document): Promise<vscode.DocumentLink[]> {
      const pattern = getConfig('spine', document.uri).get<string>('identifierPattern', DEFAULT_IDENTIFIER_PATTERN);
      const includeFences = getConfig('editor', document.uri).get<boolean>('linkInCodeFences', false);
      const matches = collectIdentifiers(document, pattern, includeFences);
      if (matches.length === 0) {
        return [];
      }

      const index = await indexService.loadForDocument(document);
      const links: vscode.DocumentLink[] = [];

      for (const match of matches) {
        if (isCommentIdentifier(match.id)) {
          const commentId = normalizeCommentIdentifier(match.id);
          const encodedArgs = encodeURIComponent(JSON.stringify([commentId]));
          const commandUri = vscode.Uri.parse(`command:stegoSpine.openCommentThread?${encodedArgs}`);
          const link = new vscode.DocumentLink(match.range, commandUri);
          link.tooltip = `Open comment ${commentId}`;
          links.push(link);
        } else {
          const link = new vscode.DocumentLink(match.range, createExploreIdentifierCommandUri(match.id));
          const record = index.get(match.id);
          if (record?.title) {
            link.tooltip = `${match.id}: ${record.title}`;
          } else {
            link.tooltip = `Explore ${match.id} in Spine sidebar`;
          }
          links.push(link);
        }
      }

      return links;
    }
  };
}

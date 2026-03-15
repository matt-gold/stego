import * as vscode from 'vscode';
import { DEFAULT_IDENTIFIER_PATTERN } from '../../shared/constants';
import { escapeMarkdown } from '../../shared/markdown';
import { collectIdentifiers } from './collectIdentifiers';
import { isCommentIdentifier, normalizeCommentIdentifier } from '../comments';
import { LeafIndexService } from '../indexing';
import { createExploreIdentifierCommandUri } from '../navigation';
import { getConfig } from '../project';

export function createHoverProvider(indexService: LeafIndexService): vscode.HoverProvider {
  return {
    async provideHover(document, position): Promise<vscode.Hover | undefined> {
      if (!getConfig('editor', document.uri).get<boolean>('enableHover', true)) {
        return undefined;
      }

      const pattern = getConfig('links', document.uri).get<string>('identifierPattern', DEFAULT_IDENTIFIER_PATTERN);
      const includeFences = getConfig('editor', document.uri).get<boolean>('linkInCodeFences', false);
      const matches = collectIdentifiers(document, pattern, includeFences);
      const match = matches.find((candidate) => candidate.range.contains(position));
      if (!match) {
        return undefined;
      }

      if (isCommentIdentifier(match.id)) {
        const commentId = normalizeCommentIdentifier(match.id);
        const encodedArgs = encodeURIComponent(JSON.stringify([commentId]));
        const commandUri = vscode.Uri.parse(`command:stegoExplore.openCommentThread?${encodedArgs}`);
        const commentMd = new vscode.MarkdownString();
        commentMd.isTrusted = {
          enabledCommands: ['stegoExplore.openCommentThread']
        };
        commentMd.appendMarkdown(`**${commentId}**`);
        commentMd.appendMarkdown(`\\n\\nComment identifier.`);
        commentMd.appendMarkdown(`\\n\\n[Open comment](${commandUri.toString()})`);
        return new vscode.Hover(commentMd, match.range);
      }

      const index = await indexService.loadForDocument(document);
      const record = index.get(match.id);

      const md = new vscode.MarkdownString();
      md.isTrusted = true;
      md.appendMarkdown(`**${match.id}**`);

      if (record?.title) {
        md.appendMarkdown(`\\n\\n${escapeMarkdown(record.title)}`);
      }

      if (record?.description) {
        md.appendMarkdown(`\\n\\n${escapeMarkdown(record.description)}`);
      }

      md.appendMarkdown(`\\n\\n[Open linked leaf](${createExploreIdentifierCommandUri(match.id).toString()})`);

      return new vscode.Hover(md, match.range);
    }
  };
}

import * as vscode from 'vscode';
import { DEFAULT_IDENTIFIER_PATTERN } from '../../shared/constants';
import { escapeMarkdown } from '../../shared/markdown';
import { collectIdentifiers } from './collectIdentifiers';
import { createExploreIdentifierCommandUri } from '../navigation/openTargets';
import { getConfig } from '../project/projectConfig';
import { BibleIndexService } from '../indexing/bibleIndexService';

export function createHoverProvider(indexService: BibleIndexService): vscode.HoverProvider {
  return {
    async provideHover(document, position): Promise<vscode.Hover | undefined> {
      const config = getConfig(document.uri);
      if (!config.get<boolean>('enableHover', true)) {
        return undefined;
      }

      const pattern = config.get<string>('identifierPattern', DEFAULT_IDENTIFIER_PATTERN);
      const includeFences = config.get<boolean>('linkInCodeFences', false);
      const matches = collectIdentifiers(document, pattern, includeFences);
      const match = matches.find((candidate) => candidate.range.contains(position));
      if (!match) {
        return undefined;
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

      md.appendMarkdown(`\\n\\n[Open in Bible Browser](${createExploreIdentifierCommandUri(match.id).toString()})`);

      return new vscode.Hover(md, match.range);
    }
  };
}

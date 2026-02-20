import * as vscode from 'vscode';
import type { IdentifierMatch } from '../../shared/types';
import { collectIdentifierOccurrencesFromLines } from './identifierExtraction';

export {
  collectIdentifierOccurrencesFromLines,
  extractIdentifierTokensFromValue,
  tryParseIdentifierFromHeading,
  getIdentifierPrefix,
  isFenceBoundary,
  compileGlobalRegex
} from './identifierExtraction';

export function collectIdentifiers(document: vscode.TextDocument, pattern: string, includeCodeFences: boolean): IdentifierMatch[] {
  const lines: string[] = [];
  for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber += 1) {
    lines.push(document.lineAt(lineNumber).text);
  }

  const occurrences = collectIdentifierOccurrencesFromLines(lines, pattern, includeCodeFences);
  return occurrences.map((occurrence) => ({
    id: occurrence.id,
    range: new vscode.Range(
      new vscode.Position(occurrence.line, occurrence.start),
      new vscode.Position(occurrence.line, occurrence.start + occurrence.id.length)
    )
  }));
}

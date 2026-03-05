import * as vscode from 'vscode';
import * as yaml from 'js-yaml';
import { FRONTMATTER_YAML_SCHEMA } from '../../shared/constants';
import type { FrontmatterLineRange, ParsedMarkdownDocument } from '../../shared/types';
import { START_SENTINEL, END_SENTINEL } from '../../../../shared/src/domain/comments';
import {
  formatMetadataValue as formatSharedMetadataValue,
  isValidMetadataKey as isSharedValidMetadataKey,
  orderFrontmatterStatusFirst as orderSharedFrontmatterStatusFirst,
  parseMarkdownDocument as parseSharedMarkdownDocument,
  serializeMarkdownDocument as serializeSharedMarkdownDocument,
  type FrontmatterRecord,
  type ParsedMarkdownDocument as SharedParsedMarkdownDocument
} from '../../../../shared/src/domain/frontmatter';

export function parseMarkdownDocument(text: string): ParsedMarkdownDocument {
  return parseSharedMarkdownDocument(text);
}

export function orderFrontmatterStatusFirst(frontmatter: Record<string, unknown>): Record<string, unknown> {
  return orderSharedFrontmatterStatusFirst(frontmatter as FrontmatterRecord);
}

export function serializeMarkdownDocument(parsed: ParsedMarkdownDocument): string {
  return serializeSharedMarkdownDocument(parsed as SharedParsedMarkdownDocument);
}

export function parseMetadataInput(value: string): unknown {
  if (!value.trim()) {
    return '';
  }

  const loaded = yaml.load(value, { schema: FRONTMATTER_YAML_SCHEMA });
  return loaded === undefined ? value : loaded;
}

export function formatMetadataValue(value: unknown): string {
  return formatSharedMetadataValue(value);
}

export function isValidMetadataKey(value: string): boolean {
  return isSharedValidMetadataKey(value);
}

export function getFrontmatterLineRange(document: vscode.TextDocument): FrontmatterLineRange | undefined {
  if (document.lineCount < 2) {
    return undefined;
  }

  if (document.lineAt(0).text.trim() !== '---') {
    return undefined;
  }

  for (let line = 1; line < document.lineCount; line += 1) {
    if (document.lineAt(line).text.trim() === '---') {
      return { start: 0, end: line };
    }
  }

  return undefined;
}

export function getStegoCommentsLineRange(document: vscode.TextDocument): FrontmatterLineRange | undefined {
  let startLine = -1;
  let endLine = -1;

  for (let line = 0; line < document.lineCount; line += 1) {
    const text = document.lineAt(line).text.trim();
    if (text === START_SENTINEL) {
      if (startLine !== -1) {
        return undefined;
      }
      startLine = line;
      continue;
    }

    if (text === END_SENTINEL) {
      if (endLine !== -1) {
        return undefined;
      }
      endLine = line;
    }
  }

  if (startLine < 0 && endLine < 0) {
    return undefined;
  }

  if (startLine < 0 || endLine < 0 || endLine <= startLine) {
    return undefined;
  }

  let foldStart = startLine;
  return {
    start: foldStart,
    end: endLine
  };
}

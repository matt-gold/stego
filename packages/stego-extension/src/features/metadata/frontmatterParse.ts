import * as vscode from 'vscode';
import * as yaml from 'js-yaml';
import { FRONTMATTER_YAML_SCHEMA } from '../../shared/constants';
import type { FrontmatterLineRange, ParsedMarkdownDocument } from '../../shared/types';

export function parseMarkdownDocument(text: string): ParsedMarkdownDocument {
  const lineEnding = text.includes('\r\n') ? '\r\n' : '\n';
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);

  if (!match) {
    return {
      lineEnding,
      hasFrontmatter: false,
      frontmatter: {},
      body: text
    };
  }

  const yamlText = match[1];
  const loaded = yamlText.trim().length > 0
    ? yaml.load(yamlText, { schema: FRONTMATTER_YAML_SCHEMA })
    : {};
  if (loaded === null || loaded === undefined) {
    return {
      lineEnding,
      hasFrontmatter: true,
      frontmatter: {},
      body: text.slice(match[0].length)
    };
  }

  if (typeof loaded !== 'object' || Array.isArray(loaded)) {
    throw new Error('Frontmatter must be a YAML object with key/value pairs.');
  }

  return {
    lineEnding,
    hasFrontmatter: true,
    frontmatter: { ...(loaded as Record<string, unknown>) },
    body: text.slice(match[0].length)
  };
}

export function orderFrontmatterStatusFirst(frontmatter: Record<string, unknown>): Record<string, unknown> {
  if (!Object.prototype.hasOwnProperty.call(frontmatter, 'status')) {
    return frontmatter;
  }

  const ordered: Record<string, unknown> = {
    status: frontmatter.status
  };
  for (const [key, value] of Object.entries(frontmatter)) {
    if (key === 'status') {
      continue;
    }
    ordered[key] = value;
  }

  return ordered;
}

export function serializeMarkdownDocument(parsed: ParsedMarkdownDocument): string {
  const includeFrontmatter = parsed.hasFrontmatter || Object.keys(parsed.frontmatter).length > 0;
  const normalizedBody = parsed.body.replace(/^\r?\n*/, '');

  if (!includeFrontmatter) {
    return parsed.body;
  }

  const orderedFrontmatter = orderFrontmatterStatusFirst(parsed.frontmatter);
  const yamlBody = yaml.dump(orderedFrontmatter, { lineWidth: -1, noRefs: true }).trimEnd();
  const frontmatterBlock = yamlBody.length > 0
    ? `---${parsed.lineEnding}${yamlBody}${parsed.lineEnding}---`
    : `---${parsed.lineEnding}---`;

  if (!normalizedBody) {
    return `${frontmatterBlock}${parsed.lineEnding}`;
  }

  return `${frontmatterBlock}${parsed.lineEnding}${parsed.lineEnding}${normalizedBody}`;
}

export function parseMetadataInput(value: string): unknown {
  if (!value.trim()) {
    return '';
  }

  const loaded = yaml.load(value, { schema: FRONTMATTER_YAML_SCHEMA });
  return loaded === undefined ? value : loaded;
}

export function formatMetadataValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  const dumped = yaml.dump(value, { lineWidth: -1, noRefs: true }).trim();
  return dumped || String(value);
}

export function isValidMetadataKey(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value);
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
  const startSentinel = '<!-- stego-comments:start -->';
  const endSentinel = '<!-- stego-comments:end -->';

  let startLine = -1;
  let endLine = -1;

  for (let line = 0; line < document.lineCount; line += 1) {
    const text = document.lineAt(line).text.trim();
    if (text === startSentinel) {
      if (startLine !== -1) {
        return undefined;
      }
      startLine = line;
      continue;
    }

    if (text === endSentinel) {
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

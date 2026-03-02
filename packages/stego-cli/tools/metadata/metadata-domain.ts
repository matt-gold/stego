import path from "node:path";

export type FrontmatterScalar = string | number | boolean | null;
export type FrontmatterValue = FrontmatterScalar | FrontmatterScalar[];
export type FrontmatterRecord = Record<string, FrontmatterValue>;

export interface ParsedMarkdownDocument {
  lineEnding: string;
  hasFrontmatter: boolean;
  frontmatter: FrontmatterRecord;
  body: string;
}

export function parseMarkdownDocument(raw: string): ParsedMarkdownDocument {
  const lineEnding = raw.includes("\r\n") ? "\r\n" : "\n";

  if (!raw.startsWith("---\n") && !raw.startsWith("---\r\n")) {
    return {
      lineEnding,
      hasFrontmatter: false,
      frontmatter: {},
      body: raw
    };
  }

  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    throw new Error("Metadata opening delimiter found, but closing delimiter is missing.");
  }

  const frontmatterText = match[1];
  const body = raw.slice(match[0].length);
  const frontmatter: FrontmatterRecord = {};
  const lines = frontmatterText.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 0) {
      throw new Error(`Invalid metadata line '${line}'. Expected 'key: value'.`);
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (!key) {
      throw new Error(`Invalid metadata line '${line}'. Missing key.`);
    }

    if (!value) {
      let lookahead = i + 1;
      while (lookahead < lines.length) {
        const nextTrimmed = lines[lookahead].trim();
        if (!nextTrimmed || nextTrimmed.startsWith("#")) {
          lookahead += 1;
          continue;
        }
        break;
      }

      if (lookahead < lines.length) {
        const firstItemLine = lines[lookahead];
        const firstItemTrimmed = firstItemLine.trim();
        const firstItemIndent = firstItemLine.length - firstItemLine.trimStart().length;
        if (firstItemIndent > 0 && firstItemTrimmed.startsWith("- ")) {
          const items: FrontmatterScalar[] = [];
          let j = lookahead;
          while (j < lines.length) {
            const rawCandidate = lines[j];
            const trimmed = rawCandidate.trim();
            if (!trimmed || trimmed.startsWith("#")) {
              j += 1;
              continue;
            }

            const indent = rawCandidate.length - rawCandidate.trimStart().length;
            if (indent === 0) {
              break;
            }
            if (!trimmed.startsWith("- ")) {
              throw new Error(`Unsupported metadata list line '${trimmed}'. Expected '- value'.`);
            }

            items.push(coerceScalarValue(trimmed.slice(2).trim()));
            j += 1;
          }

          frontmatter[key] = items;
          i = j - 1;
          continue;
        }
      }
    }

    frontmatter[key] = coerceScalarValue(value);
  }

  return {
    lineEnding,
    hasFrontmatter: true,
    frontmatter,
    body
  };
}

export function serializeMarkdownDocument(parsed: ParsedMarkdownDocument): string {
  const lineEnding = parsed.lineEnding || "\n";
  const includeFrontmatter = parsed.hasFrontmatter || Object.keys(parsed.frontmatter).length > 0;
  const normalizedBody = normalizeBodyLineEndings(parsed.body || "", lineEnding);

  if (!includeFrontmatter) {
    return normalizedBody;
  }

  const ordered = orderFrontmatterStatusFirst(parsed.frontmatter);
  const yamlLines: string[] = [];
  for (const key of Object.keys(ordered)) {
    const value = ordered[key];
    if (Array.isArray(value)) {
      yamlLines.push(`${key}:`);
      for (const item of value) {
        yamlLines.push(`  - ${formatScalar(item)}`);
      }
      continue;
    }

    yamlLines.push(`${key}: ${formatScalar(value)}`);
  }

  const frontmatterBlock = yamlLines.length > 0
    ? `---${lineEnding}${yamlLines.join(lineEnding)}${lineEnding}---`
    : `---${lineEnding}---`;

  if (!normalizedBody.trim()) {
    return `${frontmatterBlock}${lineEnding}`;
  }

  const trimmedBody = normalizedBody.replace(/^(\r?\n)+/, "");
  return `${frontmatterBlock}${lineEnding}${lineEnding}${trimmedBody}`;
}

export function normalizeFrontmatterRecord(raw: unknown): FrontmatterRecord {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Input payload 'frontmatter' must be a JSON object.");
  }

  const result: FrontmatterRecord = {};
  for (const [key, value] of Object.entries(raw)) {
    const normalizedKey = key.trim();
    if (!normalizedKey) {
      throw new Error("Frontmatter keys cannot be empty.");
    }

    result[normalizedKey] = normalizeFrontmatterValue(value, normalizedKey);
  }
  return result;
}

export function deriveDefaultLabelFromFilename(filePath: string): string {
  const basename = path.basename(filePath, path.extname(filePath));
  const normalized = basename
    .replace(/[_-]+/g, " ")
    .trim();
  if (!normalized) {
    return "New Entry";
  }
  return normalized.replace(/\b\w/g, (value) => value.toUpperCase());
}

function orderFrontmatterStatusFirst(frontmatter: FrontmatterRecord): FrontmatterRecord {
  if (!Object.hasOwn(frontmatter, "status")) {
    return { ...frontmatter };
  }

  const ordered: FrontmatterRecord = {
    status: frontmatter.status
  };
  for (const [key, value] of Object.entries(frontmatter)) {
    if (key === "status") {
      continue;
    }
    ordered[key] = value;
  }
  return ordered;
}

function normalizeBodyLineEndings(body: string, lineEnding: string): string {
  return body.replace(/\r?\n/g, lineEnding);
}

function normalizeFrontmatterValue(value: unknown, key: string): FrontmatterValue {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeFrontmatterScalar(item, key));
  }
  return normalizeFrontmatterScalar(value, key);
}

function normalizeFrontmatterScalar(value: unknown, key: string): FrontmatterScalar {
  if (value === null) {
    return null;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  throw new Error(`Metadata key '${key}' must be a scalar or array of scalars.`);
}

function coerceScalarValue(rawValue: string): FrontmatterScalar {
  const value = rawValue.trim();
  if (!value) {
    return "";
  }

  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  if (value === "null") {
    return null;
  }

  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }

  if (/^-?\d+$/.test(value)) {
    return Number(value);
  }

  return value;
}

function formatScalar(value: FrontmatterScalar): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  const normalized = value.trim();
  if (!normalized) {
    return "\"\"";
  }

  if (/^-?\d+$/.test(normalized) || normalized === "true" || normalized === "false" || normalized === "null") {
    return JSON.stringify(normalized);
  }

  if (/^[A-Za-z0-9._/@:+-]+$/.test(normalized)) {
    return normalized;
  }

  return JSON.stringify(normalized);
}

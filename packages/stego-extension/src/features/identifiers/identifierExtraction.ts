export function collectIdentifierOccurrencesFromLines(
  lines: string[],
  pattern: string,
  includeCodeFences: boolean
): Array<{ id: string; line: number; start: number }> {
  const regex = compileGlobalRegex(pattern);
  if (!regex) {
    return [];
  }

  const matches: Array<{ id: string; line: number; start: number }> = [];
  let inFence = false;

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    const lineText = lines[lineNumber];
    const trimmed = lineText.trimStart();

    if (isFenceBoundary(trimmed)) {
      inFence = !inFence;
      if (!includeCodeFences) {
        continue;
      }
    }

    if (inFence && !includeCodeFences) {
      continue;
    }

    regex.lastIndex = 0;
    for (const match of lineText.matchAll(regex)) {
      const id = match[0];
      const startCol = match.index;
      if (startCol === undefined) {
        continue;
      }

      matches.push({ id, line: lineNumber, start: startCol });
    }
  }

  return matches;
}

export function extractIdentifierTokensFromValue(value: unknown, pattern: string): string[] {
  const values: string[] = [];
  if (typeof value === 'string') {
    values.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string') {
        values.push(item);
      }
    }
  } else {
    return [];
  }

  const result: string[] = [];
  const seen = new Set<string>();
  const regex = compileGlobalRegex(pattern);
  if (!regex) {
    return result;
  }

  for (const rawValue of values) {
    regex.lastIndex = 0;
    const matches = rawValue.match(regex) ?? [];
    for (const token of matches) {
      const normalized = token.toUpperCase();
      if (seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);
      result.push(normalized);
    }
  }

  return result;
}

export function tryParseIdentifierFromHeading(heading: string): string | undefined {
  const match = heading.match(/^([A-Za-z][A-Za-z0-9]*-[A-Za-z0-9][A-Za-z0-9-]*)\b/);
  return match ? match[1].toUpperCase() : undefined;
}

export function getIdentifierPrefix(identifier: string): string | undefined {
  const dash = identifier.indexOf('-');
  if (dash <= 0) {
    return undefined;
  }

  return identifier.slice(0, dash).toUpperCase();
}

export function isFenceBoundary(trimmedLine: string): boolean {
  return /^(`{3,}|~{3,})/.test(trimmedLine);
}

export function compileGlobalRegex(pattern: string): RegExp | undefined {
  try {
    const base = new RegExp(pattern);
    const flags = base.flags.includes('g') ? base.flags : `${base.flags}g`;
    return new RegExp(base.source, flags);
  } catch {
    return undefined;
  }
}

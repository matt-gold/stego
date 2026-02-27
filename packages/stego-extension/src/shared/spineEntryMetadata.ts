export function normalizeSpineEntryLabel(value: string | undefined | null): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith('\'') && trimmed.endsWith('\''))
  ) {
    const unquoted = trimmed.slice(1, -1).trim();
    return unquoted || undefined;
  }

  return trimmed;
}

export function parseLeadingSpineEntryLabelLine(line: string): string | undefined {
  const match = line.trim().match(/^label\s*:\s*(.*)$/i);
  if (!match) {
    return undefined;
  }

  return normalizeSpineEntryLabel(match[1]);
}

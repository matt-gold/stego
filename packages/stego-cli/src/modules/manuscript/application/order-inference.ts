import type { LeafOrderEntry } from "../types.ts";

export function parseLeafPrefix(raw: string | undefined): number | undefined {
  if (raw == null) {
    return undefined;
  }

  const normalized = raw.trim();
  if (!normalized) {
    throw new Error("Option --i/-i requires a numeric value.");
  }

  if (!/^\d+$/.test(normalized)) {
    throw new Error(`Invalid manuscript prefix '${raw}'. Use a non-negative integer.`);
  }

  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Invalid manuscript prefix '${raw}'. Use a smaller integer value.`);
  }

  return parsed;
}

export function parseRequestedLeafFilename(raw: string | undefined): string | undefined {
  if (raw == null) {
    return undefined;
  }

  const normalized = raw.trim();
  if (!normalized) {
    throw new Error("Option --filename requires a value.");
  }

  if (/[\\/]/.test(normalized)) {
    throw new Error(`Invalid filename '${raw}'. Use a filename only (no directory separators).`);
  }

  const withExtension = normalized.toLowerCase().endsWith(".md")
    ? normalized
    : `${normalized}.md`;
  const stem = withExtension.slice(0, -3).trim();
  if (!stem) {
    throw new Error(`Invalid filename '${raw}'.`);
  }

  return withExtension;
}

export function parseOrderFromLeafFilename(filename: string): number | undefined {
  const match = filename.match(/^(\d+)[-_]/);
  if (!match) {
    return undefined;
  }

  return Number(match[1]);
}

export function inferNextLeafPrefix(entries: LeafOrderEntry[]): number {
  if (entries.length === 0) {
    return 100;
  }

  if (entries.length === 1) {
    return entries[0].order + 100;
  }

  const previous = entries[entries.length - 2].order;
  const latest = entries[entries.length - 1].order;
  const step = latest - previous;
  return latest + (step > 0 ? step : 1);
}

import * as yaml from "js-yaml";
import type { FrontmatterRecord, FrontmatterScalar, FrontmatterValue } from "./parser.ts";

export function isValidMetadataKey(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

export function parseMetadataInput(value: string): unknown {
  if (!value.trim()) {
    return "";
  }

  const loaded = yaml.load(value);
  return loaded === undefined ? value : loaded;
}

export function formatMetadataValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  const dumped = yaml.dump(value, { lineWidth: -1, noRefs: true }).trim();
  return dumped || String(value);
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

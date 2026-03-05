import fs from "node:fs";
import path from "node:path";
import { CliError } from "../../../../../shared/src/contracts/cli/index.ts";
import type { SpineOutputFormat } from "../types.ts";

export function parseSpineOutputFormat(rawValue: unknown): SpineOutputFormat {
  if (rawValue === undefined || rawValue === null || rawValue === "text") {
    return "text";
  }
  if (rawValue === "json") {
    return "json";
  }

  throw new CliError("INVALID_USAGE", "Invalid --format value. Use 'text' or 'json'.");
}

export function readRequiredMetadata(projectMeta: Record<string, unknown>): string[] {
  const rawValue = projectMeta.requiredMetadata;
  if (!Array.isArray(rawValue)) {
    return [];
  }

  const seen = new Set<string>();
  const keys: string[] = [];
  for (const candidate of rawValue) {
    if (typeof candidate !== "string") {
      continue;
    }

    const normalized = candidate.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    keys.push(normalized);
  }

  return keys;
}

export function writeRequiredMetadata(
  projectRoot: string,
  projectMeta: Record<string, unknown>,
  requiredMetadata: string[]
): void {
  const projectJsonPath = path.join(projectRoot, "stego-project.json");
  const next = {
    ...projectMeta,
    requiredMetadata
  };

  try {
    fs.writeFileSync(projectJsonPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CliError("WRITE_FAILURE", `Failed to update ${projectJsonPath}: ${message}`);
  }
}

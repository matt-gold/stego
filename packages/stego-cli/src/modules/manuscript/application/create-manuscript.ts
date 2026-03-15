import path from "node:path";
import { isValidLeafId } from "@stego-labs/shared/domain/content";
import type { ProjectContext } from "../../project/index.ts";
import type { ManuscriptOutputFormat, NewManuscriptInput, NewManuscriptResult } from "../types.ts";
import {
  fileExists,
  ensureManuscriptDir,
  joinPath,
  listExistingLeafIds,
  listManuscriptOrderEntries,
  writeTextFile
} from "../infra/manuscript-repo.ts";
import {
  inferNextManuscriptPrefix,
  parseManuscriptPrefix,
  parseOrderFromManuscriptFilename,
  parseRequestedManuscriptFilename
} from "./order-inference.ts";

const DEFAULT_NEW_MANUSCRIPT_SLUG = "new-leaf";

export function createNewManuscript(input: NewManuscriptInput): NewManuscriptResult {
  const project = input.project;
  ensureManuscriptDir(project.contentDir);

  const requiredMetadataState = resolveRequiredMetadata(project);
  if (requiredMetadataState.errors.length > 0) {
    throw new Error(
      `Unable to resolve required metadata for project '${project.id}': ${requiredMetadataState.errors.join(" ")}`
    );
  }

  const existingEntries = listManuscriptOrderEntries(project.contentDir);
  const explicitPrefix = parseManuscriptPrefix(input.requestedPrefixRaw);
  const requestedFilename = parseRequestedManuscriptFilename(input.requestedFilenameRaw);
  if (requestedFilename && explicitPrefix != null) {
    throw new Error("Options --filename and --i/-i cannot be used together.");
  }

  let filename: string;
  if (requestedFilename) {
    const requestedOrder = parseOrderFromManuscriptFilename(requestedFilename);
    if (requestedOrder != null) {
      const collision = existingEntries.find((entry) => entry.order === requestedOrder);
      if (collision) {
        throw new Error(
          `Leaf prefix '${requestedOrder}' is already used by '${collision.filename}'. Choose a different filename prefix.`
        );
      }
    }
    filename = requestedFilename;
  } else {
    const nextPrefix = explicitPrefix ?? inferNextManuscriptPrefix(existingEntries);
    const collision = existingEntries.find((entry) => entry.order === nextPrefix);
    if (collision) {
      throw new Error(
        `Leaf prefix '${nextPrefix}' is already used by '${collision.filename}'. Re-run with --i <number> to choose an unused prefix.`
      );
    }
    filename = `${nextPrefix}-${DEFAULT_NEW_MANUSCRIPT_SLUG}.md`;
  }

  const manuscriptPath = joinPath(project.contentDir, filename);
  if (fileExists(manuscriptPath)) {
    throw new Error(`Leaf already exists: ${filename}`);
  }

  const existingLeafIds = new Set(listExistingLeafIds(project.contentDir));
  const leafId = resolveLeafId(input.requestedIdRaw, filename, existingLeafIds);

  writeTextFile(
    manuscriptPath,
    renderNewManuscriptTemplate(requiredMetadataState.requiredMetadata, leafId)
  );

  return {
    projectId: project.id,
    filePath: path.relative(project.workspace.repoRoot, manuscriptPath)
  };
}

export function parseManuscriptOutputFormat(raw: string | undefined): ManuscriptOutputFormat {
  if (!raw || raw === "text") {
    return "text";
  }
  if (raw === "json") {
    return "json";
  }
  throw new Error("Invalid --format value. Use 'text' or 'json'.");
}

function resolveRequiredMetadata(project: ProjectContext): { requiredMetadata: string[]; errors: string[] } {
  const raw = project.meta.requiredMetadata;
  if (raw == null) {
    return {
      requiredMetadata: project.workspace.config.requiredMetadata,
      errors: []
    };
  }

  if (!Array.isArray(raw)) {
    return {
      requiredMetadata: project.workspace.config.requiredMetadata,
      errors: ["Project 'requiredMetadata' must be an array of metadata keys."]
    };
  }

  const requiredMetadata: string[] = [];
  const seen = new Set<string>();
  const errors: string[] = [];

  for (const [index, entry] of raw.entries()) {
    if (typeof entry !== "string") {
      errors.push(`Project 'requiredMetadata' entry at index ${index} must be a string.`);
      continue;
    }

    const key = entry.trim();
    if (!key) {
      errors.push(`Project 'requiredMetadata' entry at index ${index} cannot be empty.`);
      continue;
    }

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    requiredMetadata.push(key);
  }

  return {
    requiredMetadata,
    errors
  };
}

function renderNewManuscriptTemplate(requiredMetadata: string[], leafId: string): string {
  const lines: string[] = ["---", `id: ${leafId}`, "status: draft"];
  const seenKeys = new Set<string>(["status"]);

  for (const key of requiredMetadata) {
    const normalized = key.trim();
    if (!normalized || seenKeys.has(normalized)) {
      continue;
    }
    seenKeys.add(normalized);
    lines.push(`${normalized}:`);
  }

  lines.push("---", "");
  return `${lines.join("\n")}\n`;
}

function resolveLeafId(
  requestedIdRaw: string | undefined,
  filename: string,
  existingLeafIds: Set<string>
): string {
  const explicit = requestedIdRaw?.trim().toUpperCase();
  if (explicit) {
    if (!isValidLeafId(explicit)) {
      throw new Error(`Leaf id '${requestedIdRaw}' is invalid. Use token-style ids like CFG-TEMPLATES.`);
    }
    if (existingLeafIds.has(explicit)) {
      throw new Error(`Leaf id '${explicit}' is already used by another file. Choose a different --id.`);
    }
    return explicit;
  }

  const basename = path.basename(filename, path.extname(filename)).replace(/^\d+[-_]?/, "");
  const normalized = basename
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
  const fallback = normalized.includes("-") ? normalized : `LEAF-${normalized || "UNTITLED"}`;
  const baseId = isValidLeafId(fallback) ? fallback : "LEAF-UNTITLED";
  if (!existingLeafIds.has(baseId)) {
    return baseId;
  }

  const orderMatch = path.basename(filename, path.extname(filename)).match(/^(\d+)[-_]/);
  const orderSuffix = orderMatch ? `${baseId}-${orderMatch[1]}` : undefined;
  if (orderSuffix && isValidLeafId(orderSuffix) && !existingLeafIds.has(orderSuffix)) {
    return orderSuffix;
  }

  let counter = 2;
  while (true) {
    const candidate = `${baseId}-${counter}`;
    if (isValidLeafId(candidate) && !existingLeafIds.has(candidate)) {
      return candidate;
    }
    counter += 1;
  }
}

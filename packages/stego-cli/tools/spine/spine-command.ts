import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  createSpineCategory,
  createSpineEntry,
  readSpineCatalog
} from "./spine-domain.ts";

type ParsedOptions = {
  _: string[];
  [key: string]: string | boolean | string[] | undefined;
};

type OutputFormat = "text" | "json";

type ProjectContext = {
  id: string;
  root: string;
  spineDir: string;
  meta: Record<string, unknown>;
};

type SpineReadEnvelope = {
  ok: true;
  operation: "read";
  state: {
    projectId: string;
    categories: Array<{
      key: string;
      label: string;
      path: string;
      metadataPath: string;
      entries: Array<{
        key: string;
        label: string;
        title: string;
        description: string;
        path: string;
      }>;
    }>;
    issues: string[];
  };
};

type SpineNewCategoryEnvelope = {
  ok: true;
  operation: "new-category";
  result: {
    key: string;
    label: string;
    categoryDir: string;
    metadataPath: string;
    requiredMetadataUpdated: boolean;
  };
};

type SpineNewEntryEnvelope = {
  ok: true;
  operation: "new";
  result: {
    category: string;
    entryKey: string;
    filePath: string;
  };
};

export function runSpineCommand(options: ParsedOptions, project: ProjectContext): void {
  const [subcommand] = options._;
  if (!subcommand) {
    throw new Error("Spine subcommand is required. Use: read, new-category, new.");
  }

  if (subcommand === "add-category") {
    throw new Error("`stego spine add-category` is deprecated. Use `stego spine new-category`.");
  }
  if (subcommand === "new-entry") {
    throw new Error("`stego spine new-entry` is deprecated. Use `stego spine new`.");
  }

  const outputFormat = parseOutputFormat(readString(options, "format"));
  switch (subcommand) {
    case "read": {
      const catalog = readSpineCatalog(project.root, project.spineDir);
      emit({
        ok: true,
        operation: "read",
        state: {
          projectId: project.id,
          categories: catalog.categories,
          issues: catalog.issues
        }
      }, outputFormat);
      return;
    }
    case "new-category": {
      const key = readString(options, "key");
      if (!key) {
        throw new Error("--key is required for `stego spine new-category`.");
      }
      const label = readString(options, "label");
      const requireMetadata = options["require-metadata"] === true;
      const requiredMetadata = readRequiredMetadata(project.meta);
      const result = createSpineCategory(
        project.root,
        project.spineDir,
        key,
        label,
        requiredMetadata,
        requireMetadata
      );

      if (requireMetadata && result.requiredMetadataUpdated) {
        writeRequiredMetadata(project.root, project.meta, requiredMetadata);
      }

      emit({
        ok: true,
        operation: "new-category",
        result
      }, outputFormat);
      return;
    }
    case "new": {
      const category = readString(options, "category");
      if (!category) {
        throw new Error("--category is required for `stego spine new`.");
      }
      if (options.entry !== undefined) {
        throw new Error("Unknown option '--entry' for `stego spine new`. Use `--filename`.");
      }

      const filename = readString(options, "filename");
      const result = createSpineEntry(project.root, project.spineDir, category, filename);
      emit({
        ok: true,
        operation: "new",
        result
      }, outputFormat);
      return;
    }
    default:
      throw new Error(`Unknown spine subcommand '${subcommand}'. Use: read, new-category, new.`);
  }
}

function emit(
  payload: SpineReadEnvelope | SpineNewCategoryEnvelope | SpineNewEntryEnvelope,
  outputFormat: OutputFormat
): void {
  if (outputFormat === "json") {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  switch (payload.operation) {
    case "read":
      process.stdout.write(
        `Spine categories: ${payload.state.categories.length}. ` +
        `Entries: ${payload.state.categories.reduce((sum, category) => sum + category.entries.length, 0)}.\n`
      );
      return;
    case "new-category":
      process.stdout.write(
        `Created spine category '${payload.result.key}' (${payload.result.metadataPath}).\n`
      );
      return;
    case "new":
      process.stdout.write(
        `Created spine entry: ${payload.result.filePath}\n`
      );
      return;
  }
}

function parseOutputFormat(raw: string | undefined): OutputFormat {
  if (!raw || raw === "text") {
    return "text";
  }
  if (raw === "json") {
    return "json";
  }
  throw new Error("Invalid --format value. Use 'text' or 'json'.");
}

function readString(options: ParsedOptions, key: string): string | undefined {
  const value = options[key];
  return typeof value === "string" ? value : undefined;
}

function readRequiredMetadata(projectMeta: Record<string, unknown>): string[] {
  const raw = projectMeta.requiredMetadata;
  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set<string>();
  const keys: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") {
      continue;
    }
    const key = entry.trim();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

function writeRequiredMetadata(projectRoot: string, projectMeta: Record<string, unknown>, requiredMetadata: string[]): void {
  const projectJsonPath = path.join(projectRoot, "stego-project.json");
  const next = {
    ...projectMeta,
    requiredMetadata
  };
  fs.writeFileSync(projectJsonPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

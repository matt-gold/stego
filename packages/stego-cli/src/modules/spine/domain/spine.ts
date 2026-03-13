import fs from "node:fs";
import path from "node:path";
import {
  parseMarkdownDocument,
  serializeMarkdownDocument
} from "@stego-labs/shared/domain/frontmatter";

const CATEGORY_KEY_PATTERN = /^[A-Za-z0-9_-]+$/;

export interface SpineEntryRecord {
  key: string;
  path: string;
  label: string;
  title: string;
  description: string;
}

export interface SpineCategoryRecord {
  key: string;
  label: string;
  path: string;
  metadataPath: string;
  entries: SpineEntryRecord[];
}

export interface SpineCatalog {
  categories: SpineCategoryRecord[];
  entriesByCategory: Map<string, Set<string>>;
  issues: string[];
}

export interface NewSpineCategoryResult {
  key: string;
  label: string;
  categoryDir: string;
  metadataPath: string;
  requiredMetadataUpdated: boolean;
}

export interface NewSpineEntryResult {
  category: string;
  entryKey: string;
  filePath: string;
}

export function readSpineCatalog(projectRoot: string, spineDir: string): SpineCatalog {
  const absoluteSpineDir = path.resolve(spineDir);
  const issues: string[] = [];
  const categories: SpineCategoryRecord[] = [];
  const entriesByCategory = new Map<string, Set<string>>();

  if (!fs.existsSync(absoluteSpineDir)) {
    return { categories, entriesByCategory, issues: [`Missing spine directory: ${absoluteSpineDir}`] };
  }

  const categoryDirs = fs
    .readdirSync(absoluteSpineDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  for (const categoryKey of categoryDirs) {
    if (!CATEGORY_KEY_PATTERN.test(categoryKey)) {
      issues.push(`Ignored invalid spine category directory '${categoryKey}'.`);
      continue;
    }

    const categoryDir = path.join(absoluteSpineDir, categoryKey);
    const metadataPath = path.join(categoryDir, "_category.md");
    const categoryLabel = readCategoryLabel(metadataPath, categoryKey);
    const entryFiles = collectEntryFiles(categoryDir);
    const entries: SpineEntryRecord[] = [];
    const knownKeys = new Set<string>();

    for (const entryFile of entryFiles) {
      const key = toEntryKey(categoryDir, entryFile);
      if (!key || knownKeys.has(key)) {
        continue;
      }

      knownKeys.add(key);
      const entryMeta = readEntryPreview(entryFile);
      entries.push({
        key,
        path: path.relative(projectRoot, entryFile).split(path.sep).join("/"),
        label: entryMeta.label,
        title: entryMeta.title,
        description: entryMeta.description
      });
    }

    entries.sort((a, b) => a.key.localeCompare(b.key));
    entriesByCategory.set(categoryKey, knownKeys);
    categories.push({
      key: categoryKey,
      label: categoryLabel,
      path: path.relative(projectRoot, categoryDir).split(path.sep).join("/"),
      metadataPath: path.relative(projectRoot, metadataPath).split(path.sep).join("/"),
      entries
    });

    if (!fs.existsSync(metadataPath)) {
      issues.push(`Missing category metadata file: ${metadataPath}`);
    }
  }

  return { categories, entriesByCategory, issues };
}

export function createSpineCategory(
  projectRoot: string,
  spineDir: string,
  keyRaw: string,
  labelRaw: string | undefined,
  requiredMetadata: string[],
  updateRequiredMetadata: boolean
): NewSpineCategoryResult {
  const key = normalizeCategoryKey(keyRaw);
  if (!key) {
    throw new Error("Category key is required.");
  }
  if (!CATEGORY_KEY_PATTERN.test(key)) {
    throw new Error(`Invalid category key '${key}'. Use letters, numbers, '_' or '-'.`);
  }

  const categoryDir = path.join(path.resolve(spineDir), key);
  fs.mkdirSync(categoryDir, { recursive: true });

  const label = (labelRaw || "").trim() || toDisplayLabel(key);
  const metadataPath = path.join(categoryDir, "_category.md");
  if (!fs.existsSync(metadataPath)) {
    const rendered = serializeMarkdownDocument({
      lineEnding: "\n",
      hasFrontmatter: true,
      frontmatter: { label },
      body: `# ${label}\n\n`
    });
    fs.writeFileSync(metadataPath, rendered, "utf8");
  }

  let requiredMetadataUpdated = false;
  if (updateRequiredMetadata) {
    const normalizedRequired = new Set(requiredMetadata.map((value) => value.trim()).filter(Boolean));
    if (!normalizedRequired.has(key)) {
      normalizedRequired.add(key);
      requiredMetadata.splice(0, requiredMetadata.length, ...Array.from(normalizedRequired));
      requiredMetadataUpdated = true;
    }
  }

  return {
    key,
    label,
    categoryDir: path.relative(projectRoot, categoryDir).split(path.sep).join("/"),
    metadataPath: path.relative(projectRoot, metadataPath).split(path.sep).join("/"),
    requiredMetadataUpdated
  };
}

export function createSpineEntry(
  projectRoot: string,
  spineDir: string,
  categoryRaw: string,
  filenameRaw: string | undefined
): NewSpineEntryResult {
  const category = normalizeCategoryKey(categoryRaw);
  if (!category) {
    throw new Error("--category is required.");
  }
  if (!CATEGORY_KEY_PATTERN.test(category)) {
    throw new Error(`Invalid category key '${category}'. Use letters, numbers, '_' or '-'.`);
  }

  const categoryDir = path.join(path.resolve(spineDir), category);
  if (!fs.existsSync(categoryDir)) {
    throw new Error(`Spine category '${category}' does not exist. Run 'stego spine new-category --key ${category}' first.`);
  }

  const filename = normalizeEntryFilename(filenameRaw);
  const fullPath = path.resolve(path.join(categoryDir, filename));
  const relativeToCategory = path.relative(categoryDir, fullPath).split(path.sep).join("/");
  if (!relativeToCategory || relativeToCategory.startsWith("..") || path.isAbsolute(relativeToCategory)) {
    throw new Error(`Invalid filename '${filename}'. Use a path inside category '${category}'.`);
  }
  if (!fullPath.toLowerCase().endsWith(".md")) {
    throw new Error(`Invalid filename '${filename}'. Use markdown file paths.`);
  }
  if (fs.existsSync(fullPath)) {
    throw new Error(`Spine entry already exists: ${fullPath}`);
  }

  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  const inferredLabel = deriveDefaultLabelFromFilename(fullPath);
  const rendered = serializeMarkdownDocument({
    lineEnding: "\n",
    hasFrontmatter: false,
    frontmatter: {},
    body: `# ${inferredLabel}\n\n`
  });
  fs.writeFileSync(fullPath, rendered, "utf8");

  return {
    category,
    entryKey: toEntryKey(categoryDir, fullPath) || path.basename(fullPath, ".md"),
    filePath: path.relative(projectRoot, fullPath).split(path.sep).join("/")
  };
}

export function toDisplayLabel(value: string): string {
  const normalized = value
    .replace(/[_-]+/g, " ")
    .trim();
  if (!normalized) {
    return value;
  }
  return normalized.replace(/\b\w/g, (part) => part.toUpperCase());
}

function readCategoryLabel(metadataPath: string, categoryKey: string): string {
  if (!fs.existsSync(metadataPath)) {
    return toDisplayLabel(categoryKey);
  }

  try {
    const raw = fs.readFileSync(metadataPath, "utf8");
    const parsed = parseMarkdownDocument(raw);
    const fromFrontmatter = typeof parsed.frontmatter.label === "string" ? parsed.frontmatter.label.trim() : "";
    if (fromFrontmatter) {
      return fromFrontmatter;
    }
    const heading = findFirstHeading(parsed.body);
    if (heading) {
      return heading;
    }
  } catch {
    // fallback below
  }

  return toDisplayLabel(categoryKey);
}

function readEntryPreview(filePath: string): { label: string; title: string; description: string } {
  const fallback = deriveDefaultLabelFromFilename(filePath);
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = parseMarkdownDocument(raw);
    const heading = findFirstHeading(parsed.body);
    const labelFromFrontmatter = typeof parsed.frontmatter.label === "string" ? parsed.frontmatter.label.trim() : "";
    const label = labelFromFrontmatter || heading || fallback;
    const title = heading || label || fallback;
    const description = firstContentLine(parsed.body, heading).slice(0, 220);
    return { label, title, description };
  } catch {
    return { label: fallback, title: fallback, description: "" };
  }
}

function collectEntryFiles(categoryDir: string): string[] {
  const files: string[] = [];
  const stack = [path.resolve(categoryDir)];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) {
        continue;
      }
      if (entry.name.toLowerCase() === "_category.md") {
        continue;
      }
      files.push(full);
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

function normalizeCategoryKey(rawValue: string): string {
  return rawValue.trim().toLowerCase();
}

function normalizeEntryFilename(rawValue: string | undefined): string {
  const trimmed = (rawValue || "").trim();
  const fallback = "new-entry.md";
  const withFallback = trimmed || fallback;
  const withExt = withFallback.toLowerCase().endsWith(".md") ? withFallback : `${withFallback}.md`;
  const normalized = withExt.replace(/\\/g, "/");
  if (normalized.startsWith("/") || normalized.includes("../") || normalized.startsWith("../")) {
    throw new Error(`Invalid filename '${rawValue || ""}'.`);
  }
  return normalized;
}

function toEntryKey(categoryDir: string, filePath: string): string | undefined {
  const relative = path.relative(categoryDir, filePath).split(path.sep).join("/");
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return undefined;
  }
  if (!relative.toLowerCase().endsWith(".md")) {
    return undefined;
  }
  return relative.slice(0, -3);
}

function findFirstHeading(body: string): string | undefined {
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    const match = trimmed.match(/^#{1,6}\s+(.+?)\s*$/);
    if (match) {
      return match[1].trim();
    }
  }
  return undefined;
}

function firstContentLine(body: string, heading: string | undefined): string {
  const lines = body.split(/\r?\n/);
  let skippedHeading = !heading;
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      continue;
    }
    if (!skippedHeading && /^#{1,6}\s+/.test(trimmed)) {
      skippedHeading = true;
      continue;
    }
    if (trimmed.startsWith("<!--")) {
      continue;
    }
    return trimmed;
  }
  return "";
}

function deriveDefaultLabelFromFilename(filePath: string): string {
  const basename = path.basename(filePath, path.extname(filePath));
  const normalized = basename
    .replace(/[_-]+/g, " ")
    .trim();

  if (!normalized) {
    return "New Entry";
  }

  return normalized.replace(/\b\w/g, (part) => part.toUpperCase());
}

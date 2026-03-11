import path from "node:path";
import type { ChapterEntry, Issue } from "../../quality/index.ts";
import type { CompileProjectContext, CompileStructureLevel } from "../types.ts";

export function resolveCompileStructureLevels(project: CompileProjectContext): {
  levels: CompileStructureLevel[];
  issues: Issue[];
} {
  const repoRoot = project.workspace.repoRoot;
  const issues: Issue[] = [];
  const projectFile = path.relative(repoRoot, path.join(project.root, "stego-project.json"));
  const raw = project.meta.compileStructure;

  if (raw == null) {
    return { levels: [], issues };
  }

  if (!isPlainObject(raw)) {
    issues.push(makeIssue("error", "metadata", "Project 'compileStructure' must be an object.", projectFile));
    return { levels: [], issues };
  }

  const rawLevels = raw.levels;
  if (!Array.isArray(rawLevels)) {
    issues.push(makeIssue("error", "metadata", "Project 'compileStructure.levels' must be an array.", projectFile));
    return { levels: [], issues };
  }

  const levels: CompileStructureLevel[] = [];
  const seenKeys = new Set<string>();
  for (const [index, entry] of rawLevels.entries()) {
    if (!isPlainObject(entry)) {
      issues.push(makeIssue("error", "metadata", `Invalid compileStructure level at index ${index}. Expected object.`, projectFile));
      continue;
    }

    const key = typeof entry.key === "string" ? entry.key.trim() : "";
    const label = typeof entry.label === "string" ? entry.label.trim() : "";
    const titleKeyRaw = typeof entry.titleKey === "string" ? entry.titleKey.trim() : "";
    const headingTemplateRaw = typeof entry.headingTemplate === "string" ? entry.headingTemplate.trim() : "";

    if (!key || !/^[a-z][a-z0-9_-]*$/.test(key)) {
      issues.push(makeIssue("error", "metadata", `compileStructure.levels[${index}].key must match /^[a-z][a-z0-9_-]*$/.`, projectFile));
      continue;
    }

    if (!label) {
      issues.push(makeIssue("error", "metadata", `compileStructure.levels[${index}].label is required.`, projectFile));
      continue;
    }

    if (seenKeys.has(key)) {
      issues.push(makeIssue("error", "metadata", `Duplicate compileStructure level key '${key}'.`, projectFile));
      continue;
    }

    if (titleKeyRaw && !/^[a-z][a-z0-9_-]*$/.test(titleKeyRaw)) {
      issues.push(makeIssue("error", "metadata", `compileStructure.levels[${index}].titleKey must match /^[a-z][a-z0-9_-]*$/.`, projectFile));
      continue;
    }

    const pageBreakRaw = typeof entry.pageBreak === "string" ? entry.pageBreak.trim() : "between-groups";
    if (pageBreakRaw !== "none" && pageBreakRaw !== "between-groups") {
      issues.push(makeIssue("error", "metadata", `compileStructure.levels[${index}].pageBreak must be 'none' or 'between-groups'.`, projectFile));
      continue;
    }

    const injectHeading = typeof entry.injectHeading === "boolean" ? entry.injectHeading : true;
    const headingTemplate = headingTemplateRaw || "{label} {value}: {title}";
    seenKeys.add(key);
    levels.push({
      key,
      label,
      titleKey: titleKeyRaw || undefined,
      injectHeading,
      headingTemplate,
      pageBreak: pageBreakRaw
    });
  }

  return { levels, issues };
}

export function validateCompileGroupingMetadata(
  chapters: ChapterEntry[],
  levels: CompileStructureLevel[]
): Issue[] {
  const issues: Issue[] = [];
  for (const chapter of chapters) {
    for (const level of levels) {
      validateGroupingScalar(chapter, level.key, issues);
      if (level.titleKey) {
        validateGroupingScalar(chapter, level.titleKey, issues);
      }
    }
  }
  return issues;
}

function validateGroupingScalar(chapter: ChapterEntry, key: string, issues: Issue[]): void {
  const rawValue = chapter.metadata[key];
  if (rawValue == null || rawValue === "") {
    return;
  }
  if (Array.isArray(rawValue) || isPlainObject(rawValue)) {
    issues.push(makeIssue("error", "metadata", `Metadata '${key}' must be a scalar value.`, chapter.relativePath));
  }
}

function makeIssue(
  level: Issue["level"],
  category: string,
  message: string,
  file: string | null = null,
  line: number | null = null
): Issue {
  return { level, category, message, file, line };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

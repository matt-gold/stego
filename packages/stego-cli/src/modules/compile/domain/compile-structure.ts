import type { CompileStructureLevel } from "../../quality/index.ts";
import type { RenderCompiledManuscriptInput } from "../types.ts";

export function renderCompiledManuscript(input: RenderCompiledManuscriptInput): string {
  const tocEntries: Array<{ level: number; heading: string }> = [];
  const previousGroupValues = new Map<string, string | undefined>();
  const previousGroupTitles = new Map<string, string | undefined>();

  const lines: string[] = [];
  lines.push(`<!-- generated: ${input.generatedAt} -->`);
  lines.push("");
  lines.push(`# ${input.title}`);
  lines.push("");

  if (input.subtitle) {
    lines.push(`_${input.subtitle}_`);
    lines.push("");
  }

  if (input.author) {
    lines.push(`Author: ${input.author}`);
    lines.push("");
  }

  lines.push(`Generated: ${input.generatedAt}`);
  lines.push("");
  lines.push("## Table of Contents");
  lines.push("");

  if (input.compileStructureLevels.length === 0) {
    lines.push(`- [Manuscript](#${slugify("Manuscript")})`);
  }

  lines.push("");

  for (let chapterIndex = 0; chapterIndex < input.chapters.length; chapterIndex += 1) {
    const chapter = input.chapters[chapterIndex];
    let insertedBreakForEntry = false;
    const levelChanged: boolean[] = [];

    for (let levelIndex = 0; levelIndex < input.compileStructureLevels.length; levelIndex += 1) {
      const level = input.compileStructureLevels[levelIndex];
      const explicitValue = chapter.groupValues[level.key];
      const previousValue = previousGroupValues.get(level.key);
      const currentValue = explicitValue ?? previousValue;
      const explicitTitle = level.titleKey ? toScalarMetadataString(chapter.metadata[level.titleKey]) : undefined;
      const previousTitle = previousGroupTitles.get(level.key);
      const currentTitle = explicitTitle ?? previousTitle;
      const parentChanged = levelIndex > 0 && levelChanged[levelIndex - 1] === true;
      const changed = parentChanged || currentValue !== previousValue;
      levelChanged.push(changed);

      if (!changed || !currentValue) {
        previousGroupValues.set(level.key, currentValue);
        previousGroupTitles.set(level.key, currentTitle);
        continue;
      }

      if (level.pageBreak === "between-groups" && chapterIndex > 0 && !insertedBreakForEntry) {
        lines.push("\\newpage");
        lines.push("");
        insertedBreakForEntry = true;
      }

      if (level.injectHeading) {
        const heading = formatCompileStructureHeading(level, currentValue, currentTitle);
        tocEntries.push({ level: levelIndex, heading });
        const headingLevel = Math.min(6, 2 + levelIndex);
        lines.push(`${"#".repeat(headingLevel)} ${heading}`);
        lines.push("");
      }

      previousGroupValues.set(level.key, currentValue);
      previousGroupTitles.set(level.key, currentTitle);
    }

    lines.push(`<!-- source: ${chapter.relativePath} | order: ${chapter.order} | status: ${chapter.status} -->`);
    lines.push("");
    lines.push(chapter.body.trim());
    lines.push("");
  }

  if (tocEntries.length > 0) {
    const tocStart = lines.indexOf("## Table of Contents");
    if (tocStart >= 0) {
      const insertAt = tocStart + 2;
      const tocLines = tocEntries.map(
        (entry) => `${"  ".repeat(entry.level)}- [${entry.heading}](#${slugify(entry.heading)})`
      );
      lines.splice(insertAt, 0, ...tocLines);
    }
  }

  return `${lines.join("\n")}\n`;
}

function formatCompileStructureHeading(
  level: CompileStructureLevel,
  value: string,
  title: string | undefined
): string {
  const resolvedTitle = title || "";
  if (!resolvedTitle && level.headingTemplate === "{label} {value}: {title}") {
    return `${level.label} ${value}`;
  }

  return level.headingTemplate
    .replaceAll("{label}", level.label)
    .replaceAll("{value}", value)
    .replaceAll("{title}", resolvedTitle)
    .replace(/\s+/g, " ")
    .replace(/:\s*$/, "")
    .trim();
}

function toScalarMetadataString(rawValue: unknown): string | undefined {
  if (rawValue == null || rawValue === "" || Array.isArray(rawValue)) {
    return undefined;
  }

  const normalized = String(rawValue).trim();
  return normalized.length > 0 ? normalized : undefined;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

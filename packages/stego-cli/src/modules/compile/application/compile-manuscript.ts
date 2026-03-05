import { nowIsoString } from "../../../platform/clock.ts";
import { renderCompiledManuscript } from "../domain/compile-structure.ts";
import { writeCompiledOutput } from "../infra/dist-writer.ts";
import type { CompileManuscriptInput, CompileManuscriptResult } from "../types.ts";

export function compileManuscript(input: CompileManuscriptInput): CompileManuscriptResult {
  const markdown = renderCompiledManuscript({
    generatedAt: nowIsoString(),
    projectId: input.project.id,
    title: input.project.meta.title || input.project.id,
    subtitle: input.project.meta.subtitle,
    author: input.project.meta.author,
    chapters: input.chapters,
    compileStructureLevels: input.compileStructureLevels
  });

  const outputPath = writeCompiledOutput(input.project.distDir, input.project.id, markdown);
  return { outputPath };
}

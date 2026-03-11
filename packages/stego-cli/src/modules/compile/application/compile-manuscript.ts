import { nowIsoString } from "../../../platform/clock.ts";
import { renderCompiledManuscript } from "../domain/compile-structure.ts";
import { rewriteMarkdownImagesForChapter } from "../domain/image-settings.ts";
import { writeCompiledOutput } from "../infra/dist-writer.ts";
import type { CompileManuscriptInput, CompileManuscriptResult } from "../types.ts";

export function compileManuscript(input: CompileManuscriptInput): CompileManuscriptResult {
  const chapters = input.chapters.map((chapter) => ({
    ...chapter,
    body: rewriteMarkdownImagesForChapter({
      body: chapter.body,
      chapterPath: chapter.path,
      projectRoot: input.project.root,
      projectMeta: input.project.meta,
      frontmatter: chapter.metadata
    })
  }));

  const markdown = renderCompiledManuscript({
    generatedAt: nowIsoString(),
    projectId: input.project.id,
    title: input.project.meta.title || input.project.id,
    subtitle: input.project.meta.subtitle,
    author: input.project.meta.author,
    chapters,
    plan: input.plan
  });

  const outputPath = writeCompiledOutput(input.project.distDir, input.project.id, markdown);
  return { outputPath };
}

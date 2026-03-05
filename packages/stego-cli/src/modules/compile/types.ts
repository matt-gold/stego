import type { ProjectContext } from "../project/index.ts";
import type { ChapterEntry, CompileStructureLevel } from "../quality/index.ts";

export type CompileModuleName = "compile";

export type CompileProjectContext = ProjectContext;

export type CompileManuscriptInput = {
  project: CompileProjectContext;
  chapters: ChapterEntry[];
  compileStructureLevels: CompileStructureLevel[];
};

export type CompileManuscriptResult = {
  outputPath: string;
};

export type RenderCompiledManuscriptInput = {
  generatedAt: string;
  projectId: string;
  title: string;
  subtitle?: string;
  author?: string;
  chapters: ChapterEntry[];
  compileStructureLevels: CompileStructureLevel[];
};

import type { ProjectContext } from "../project/index.ts";
import type { ChapterEntry, Issue } from "../quality/index.ts";

export type CompileModuleName = "compile";

export type CompileProjectContext = ProjectContext;

export interface CompileStructureLevel {
  key: string;
  label: string;
  titleKey?: string;
  injectHeading: boolean;
  headingTemplate: string;
  pageBreak: "none" | "between-groups";
}

export type CompilePlan = {
  structureLevels: CompileStructureLevel[];
};

export type ResolveCompilePlanInput = {
  project: CompileProjectContext;
  chapters: ChapterEntry[];
};

export type ResolveCompilePlanResult = {
  plan: CompilePlan;
  issues: Issue[];
};

export type CompileManuscriptInput = {
  project: CompileProjectContext;
  chapters: ChapterEntry[];
  plan: CompilePlan;
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
  plan: CompilePlan;
};

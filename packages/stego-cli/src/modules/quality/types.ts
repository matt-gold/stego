import type { ProjectContext } from "../project/index.ts";
import type { StageName } from "../../../../shared/src/domain/stages/index.ts";

export type QualityModuleName = "quality";

export type IssueLevel = "error" | "warning";

export interface Issue {
  level: IssueLevel;
  category: string;
  message: string;
  file: string | null;
  line: number | null;
}

export interface CompileStructureLevel {
  key: string;
  label: string;
  titleKey?: string;
  injectHeading: boolean;
  headingTemplate: string;
  pageBreak: "none" | "between-groups";
}

export interface SpineCategory {
  key: string;
  entries: Set<string>;
}

export interface ParsedCommentThread {
  id: string;
  resolved: boolean;
  thread: string[];
}

export type MetadataRecord = Record<string, unknown>;

export interface ChapterEntry {
  path: string;
  relativePath: string;
  title: string;
  order: number | null;
  status: string;
  referenceKeysByCategory: Record<string, string[]>;
  groupValues: Record<string, string>;
  metadata: MetadataRecord;
  body: string;
  comments: ParsedCommentThread[];
  issues: Issue[];
}

export interface SpineState {
  categories: SpineCategory[];
  entriesByCategory: Map<string, Set<string>>;
  issues: Issue[];
}

export interface ProjectInspection {
  chapters: ChapterEntry[];
  issues: Issue[];
  spineState: SpineState;
  compileStructureLevels: CompileStructureLevel[];
}

export interface InspectProjectOptions {
  onlyFile?: string;
}

export interface StagePolicy {
  minimumChapterStatus: StageName;
  requireSpine: boolean;
  enforceMarkdownlint: boolean;
  enforceCSpell: boolean;
  enforceLocalLinks: boolean;
  requireResolvedComments?: boolean;
}

export interface StageCheckResult {
  chapters: ChapterEntry[];
  issues: Issue[];
}

export interface LintSelection {
  manuscript: boolean;
  spine: boolean;
}

export interface LintResult {
  issues: Issue[];
  fileCount: number;
}

export type RequiredMetadataResult = {
  requiredMetadata: string[];
  issues: Issue[];
};

export type CompileStructureResult = {
  levels: CompileStructureLevel[];
  issues: Issue[];
};

export type QualityProjectContext = ProjectContext;

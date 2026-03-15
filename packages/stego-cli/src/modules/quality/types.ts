import type { ProjectContext } from "../project/index.ts";
import type { StageName } from "@stego-labs/shared/domain/stages";

export type QualityModuleName = "quality";

export type IssueLevel = "error" | "warning";

export interface Issue {
  level: IssueLevel;
  category: string;
  message: string;
  file: string | null;
  line: number | null;
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
  id: string | null;
  title: string;
  order: number | null;
  status: string;
  metadata: MetadataRecord;
  body: string;
  comments: ParsedCommentThread[];
  issues: Issue[];
}

export interface ProjectInspection {
  chapters: ChapterEntry[];
  issues: Issue[];
}

export interface InspectProjectOptions {
  onlyFile?: string;
}

export interface StagePolicy {
  minimumChapterStatus: StageName;
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
  content: boolean;
  notes: boolean;
}

export interface LintResult {
  issues: Issue[];
  fileCount: number;
}

export type RequiredMetadataResult = {
  requiredMetadata: string[];
  issues: Issue[];
};

export type QualityProjectContext = ProjectContext;

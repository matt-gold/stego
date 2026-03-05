import type { ProjectContext } from "../project/index.ts";
import type {
  NewSpineCategoryResult,
  NewSpineEntryResult,
  SpineCategoryRecord
} from "./domain/spine.ts";

export type SpineModuleName = "spine";

export type SpineOutputFormat = "text" | "json";

export type SpineReadEnvelope = {
  ok: true;
  operation: "read";
  state: {
    projectId: string;
    categories: SpineCategoryRecord[];
    issues: string[];
  };
};

export type SpineNewCategoryEnvelope = {
  ok: true;
  operation: "new-category";
  result: NewSpineCategoryResult;
};

export type SpineNewEntryEnvelope = {
  ok: true;
  operation: "new";
  result: NewSpineEntryResult;
};

export type SpineProjectContext = Pick<ProjectContext, "id" | "root" | "spineDir" | "meta">;

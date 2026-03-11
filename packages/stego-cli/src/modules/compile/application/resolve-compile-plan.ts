import {
  resolveCompileStructureLevels,
  validateCompileGroupingMetadata
} from "../domain/compile-plan.ts";
import type { ResolveCompilePlanInput, ResolveCompilePlanResult } from "../types.ts";

export function resolveCompilePlan(input: ResolveCompilePlanInput): ResolveCompilePlanResult {
  const structure = resolveCompileStructureLevels(input.project);
  const groupingIssues = validateCompileGroupingMetadata(input.chapters, structure.levels);
  return {
    plan: {
      structureLevels: structure.levels
    },
    issues: [...structure.issues, ...groupingIssues]
  };
}

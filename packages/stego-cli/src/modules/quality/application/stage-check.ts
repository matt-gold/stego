import type { ProjectContext } from "../../project/index.ts";
import { getStageRank, isStageName } from "@stego-labs/shared/domain/stages";
import { inspectProject } from "./inspect-project.ts";
import { collectSpineWordsForSpellcheck, runCSpell, runMarkdownlint } from "./lint-runner.ts";
import type { Issue, StageCheckResult, StagePolicy } from "../types.ts";

export function runStageCheck(project: ProjectContext, stage: string, onlyFile?: string): StageCheckResult {
  const policy = resolveStagePolicy(project, stage);
  const report = inspectProject(project, { onlyFile });
  const issues = [...report.issues];
  const minimumRank = getStageRank(policy.minimumChapterStatus);

  for (const chapter of report.chapters) {
    if (!isStageName(chapter.status)) {
      continue;
    }

    const chapterRank = getStageRank(chapter.status);

    if (chapterRank < minimumRank) {
      issues.push(
        makeIssue(
          "error",
          "stage",
          `File status '${chapter.status}' is below required stage '${policy.minimumChapterStatus}'.`,
          chapter.relativePath
        )
      );
    }

    if (stage === "final" && chapter.status !== "final") {
      issues.push(makeIssue("error", "stage", "Final stage requires all chapters to be status 'final'.", chapter.relativePath));
    }

    if (policy.requireResolvedComments) {
      const unresolvedComments = chapter.comments.filter((comment) => !comment.resolved);
      if (unresolvedComments.length > 0) {
        const unresolvedLabel = unresolvedComments.slice(0, 5).map((comment) => comment.id).join(", ");
        const remainder = unresolvedComments.length > 5 ? ` (+${unresolvedComments.length - 5} more)` : "";
        issues.push(
          makeIssue(
            "error",
            "comments",
            `Unresolved comments (${unresolvedComments.length}): ${unresolvedLabel}${remainder}. Resolve or clear comments before stage '${stage}'.`,
            chapter.relativePath
          )
        );
      }
    }
  }

  if (policy.requireSpine) {
    if (report.spineState.categories.length === 0) {
      issues.push(
        makeIssue(
          "error",
          "continuity",
          "No spine categories found. Add at least one category under spine/<category>/ before this stage."
        )
      );
    }
    for (const spineIssue of report.issues.filter((issue) => issue.category === "continuity")) {
      if (spineIssue.message.startsWith("Missing spine directory")) {
        issues.push({ ...spineIssue, level: "error" });
      }
    }
  }

  if (policy.enforceLocalLinks) {
    for (const linkIssue of issues.filter((issue) => issue.category === "links" && issue.level !== "error")) {
      linkIssue.level = "error";
      linkIssue.message = `${linkIssue.message} (strict in stage '${stage}')`;
    }
  }

  const chapterPaths = report.chapters.map((chapter) => chapter.path);
  const spineWords = collectSpineWordsForSpellcheck(report.spineState.entriesByCategory);

  if (policy.enforceMarkdownlint) {
    issues.push(...runMarkdownlint(project, chapterPaths, true, "manuscript"));
  } else {
    issues.push(...runMarkdownlint(project, chapterPaths, false, "manuscript"));
  }

  if (policy.enforceCSpell) {
    issues.push(...runCSpell(project, chapterPaths, true, spineWords));
  } else {
    issues.push(...runCSpell(project, chapterPaths, false, spineWords));
  }

  return { chapters: report.chapters, issues };
}

function resolveStagePolicy(project: ProjectContext, stage: string): StagePolicy {
  if (!isStageName(stage)) {
    throw new Error(
      `Unknown stage '${stage}'. Allowed: ${Object.keys(project.workspace.config.stagePolicies).join(", ")}.`
    );
  }

  const rawPolicy = project.workspace.config.stagePolicies[stage];
  if (!isStagePolicy(rawPolicy)) {
    throw new Error(`Invalid stage policy for '${stage}' in stego.config.json.`);
  }
  return rawPolicy;
}

function isStagePolicy(value: unknown): value is StagePolicy {
  if (!isPlainObject(value)) {
    return false;
  }

  return isStageName(String(value.minimumChapterStatus))
    && typeof value.requireSpine === "boolean"
    && typeof value.enforceMarkdownlint === "boolean"
    && typeof value.enforceCSpell === "boolean"
    && typeof value.enforceLocalLinks === "boolean"
    && (value.requireResolvedComments == null || typeof value.requireResolvedComments === "boolean");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

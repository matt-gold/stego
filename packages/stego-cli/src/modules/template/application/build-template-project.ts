import fs from "node:fs";
import path from "node:path";
import { compileProject, renderDocument, type RenderDocumentResult } from "@stego-labs/engine";
import type { PresentationTarget } from "@stego-labs/shared/domain/templates";
import type { ProjectContext } from "../../project/index.ts";

export type TemplateBuildArtifactPaths = {
  markdownFileName?: string;
  renderPlanFileName?: string;
};

export type BuildTemplateProjectResult = {
  declaredTargets: readonly PresentationTarget[] | null;
  markdownPath: string;
  renderPlanPath: string;
  renderPlan: RenderDocumentResult;
};

export async function buildTemplateProject(
  project: ProjectContext,
  templatePath?: string,
  artifactPaths: TemplateBuildArtifactPaths = {}
): Promise<BuildTemplateProjectResult> {
  const compiled = await compileProject({
    projectRoot: project.root,
    contentDir: project.contentDir,
    templatePath
  });

  const renderPlan = renderDocument({
    document: compiled.document,
    projectRoot: project.root,
    context: compiled.context
  });

  fs.mkdirSync(project.distDir, { recursive: true });
  const markdownPath = path.join(project.distDir, artifactPaths.markdownFileName || `${project.id}.template.md`);
  const renderPlanPath = path.join(
    project.distDir,
    artifactPaths.renderPlanFileName || `${project.id}.template.render-plan.json`
  );
  fs.writeFileSync(markdownPath, renderPlan.markdown, "utf8");
  fs.writeFileSync(renderPlanPath, `${JSON.stringify(renderPlan, null, 2)}\n`, "utf8");

  return {
    declaredTargets: compiled.declaredTargets,
    markdownPath,
    renderPlanPath,
    renderPlan
  };
}

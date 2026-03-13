import fs from "node:fs";
import path from "node:path";
import { compileProject, renderDocument, type RenderDocumentResult } from "@stego-labs/engine";
import type { ProjectContext } from "../../project/index.ts";

export type TemplateBuildArtifactPaths = {
  markdownFileName?: string;
  renderPlanFileName?: string;
};

export type BuildTemplateProjectResult = {
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
    manuscriptDir: project.manuscriptDir,
    spineDir: project.spineDir,
    templatePath
  });

  const renderPlan = renderDocument({
    document: compiled.document,
    projectRoot: project.root
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
    markdownPath,
    renderPlanPath,
    renderPlan
  };
}

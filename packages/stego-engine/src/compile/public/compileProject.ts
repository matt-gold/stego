import path from "node:path";
import { evaluateTemplate, loadTemplateFromFile } from "../../template/index.ts";
import type { CompileProjectInput, CompileProjectResult } from "./types.ts";
import { buildTemplateContext } from "./buildTemplateContext.ts";
import { resolveTemplatePath } from "../internal/resolve-template-path.ts";

export async function compileProject(input: CompileProjectInput): Promise<CompileProjectResult> {
  const projectRoot = path.resolve(input.projectRoot);
  const templatePath = resolveTemplatePath(projectRoot, input.templatePath);
  const context = buildTemplateContext({
    projectRoot,
    contentDir: input.contentDir
  });

  const loaded = await loadTemplateFromFile(templatePath);
  try {
    const document = evaluateTemplate(loaded.template, context);
    return {
      projectRoot,
      templatePath,
      declaredTargets: loaded.template.targets,
      context,
      document
    };
  } finally {
    loaded.cleanup();
  }
}

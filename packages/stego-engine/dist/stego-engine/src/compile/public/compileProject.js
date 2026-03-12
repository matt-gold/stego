import path from "node:path";
import { evaluateTemplate, loadTemplateFromFile } from "../../template/index.js";
import { buildTemplateContext } from "./buildTemplateContext.js";
import { resolveTemplatePath } from "../internal/resolve-template-path.js";
export async function compileProject(input) {
    const projectRoot = path.resolve(input.projectRoot);
    const templatePath = resolveTemplatePath(projectRoot, input.templatePath);
    const context = buildTemplateContext({
        projectRoot,
        manuscriptDir: input.manuscriptDir,
        spineDir: input.spineDir
    });
    const loaded = await loadTemplateFromFile(templatePath);
    try {
        const document = evaluateTemplate(loaded.template, context);
        return {
            projectRoot,
            templatePath,
            context,
            document
        };
    }
    finally {
        loaded.cleanup();
    }
}
//# sourceMappingURL=compileProject.js.map
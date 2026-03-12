import path from "node:path";
import { createCollection } from "../../collections/index.js";
import { loadManuscripts } from "../internal/load-manuscripts.js";
import { loadProject } from "../internal/load-project.js";
import { loadSpine } from "../internal/load-spine.js";
export function buildTemplateContext(input) {
    const manuscriptDir = input.manuscriptDir ?? path.join(input.projectRoot, "manuscript");
    const spineDir = input.spineDir ?? path.join(input.projectRoot, "spine");
    const project = loadProject(input.projectRoot);
    const manuscripts = loadManuscripts(input.projectRoot, manuscriptDir, project.metadata);
    const spine = loadSpine(input.projectRoot, spineDir);
    return {
        project,
        collections: {
            manuscripts: createCollection(manuscripts),
            spineEntries: createCollection(spine.entries),
            spineCategories: createCollection(spine.categories)
        }
    };
}
//# sourceMappingURL=buildTemplateContext.js.map
import fs from "node:fs";
import path from "node:path";
export function resolveTemplatePath(projectRoot, templatePath) {
    const resolved = templatePath
        ? path.resolve(projectRoot, templatePath)
        : path.join(projectRoot, "templates", "book.template.tsx");
    if (!fs.existsSync(resolved)) {
        throw new Error(`Template file not found: ${resolved}. Create 'templates/book.template.tsx' or pass --template <path>.`);
    }
    return resolved;
}
//# sourceMappingURL=resolve-template-path.js.map
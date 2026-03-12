import fs from "node:fs";
import path from "node:path";
export function loadProject(projectRoot) {
    const projectJsonPath = path.join(projectRoot, "stego-project.json");
    const raw = fs.readFileSync(projectJsonPath, "utf8");
    const parsed = JSON.parse(raw);
    const id = typeof parsed.id === "string" && parsed.id.trim()
        ? parsed.id.trim()
        : path.basename(projectRoot);
    return {
        id,
        root: projectRoot,
        metadata: parsed
    };
}
//# sourceMappingURL=load-project.js.map
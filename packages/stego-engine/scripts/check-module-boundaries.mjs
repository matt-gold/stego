import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), "src");
const moduleNames = fs.readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

const violations = [];

for (const moduleName of moduleNames) {
  const moduleRoot = path.join(root, moduleName);
  const stack = [moduleRoot];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (!entry.isFile() || (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx"))) {
        continue;
      }

      const relative = path.relative(root, fullPath);
      const moduleRelative = path.relative(moduleRoot, fullPath);
      const contents = fs.readFileSync(fullPath, "utf8");
      const matches = contents.matchAll(/from\s+["']([^"']+)["']/g);
      for (const match of matches) {
        const rawImport = match[1];
        if (!rawImport.startsWith(".")) {
          continue;
        }

        const resolved = path.resolve(path.dirname(fullPath), rawImport);
        const relativeToSrc = path.relative(root, resolved);
        if (relativeToSrc.startsWith("..")) {
          continue;
        }

        const targetParts = relativeToSrc.split(path.sep);
        const targetModule = targetParts[0];
        if (!targetModule || targetModule === moduleName) {
          if (moduleRelative.includes(`${path.sep}public${path.sep}`) && targetParts.includes("internal")) {
            violations.push(`${relative}: public code may not import internal code via '${rawImport}'`);
          }
          continue;
        }

        const isModuleIndex = targetParts.length === 2 && targetParts[1] === "index.ts";
        if (!isModuleIndex) {
          violations.push(`${relative}: deep import into module '${targetModule}' via '${rawImport}'`);
        }
      }
    }
  }
}

if (violations.length > 0) {
  process.stderr.write("Module boundary violations detected:\n");
  for (const violation of violations) {
    process.stderr.write(`- ${violation}\n`);
  }
  process.exit(1);
}

process.stdout.write("Module boundary check passed.\n");

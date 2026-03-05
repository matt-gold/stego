import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd(), 'src', 'modules');
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

      if (!entry.isFile() || !entry.name.endsWith('.ts')) {
        continue;
      }

      const relative = path.relative(path.resolve(process.cwd(), 'src'), fullPath);
      const contents = fs.readFileSync(fullPath, 'utf8');
      const matches = contents.matchAll(/from\s+["']([^"']+)["']/g);
      for (const match of matches) {
        const rawImport = match[1];
        if (!rawImport.startsWith('.')) {
          continue;
        }

        const resolved = path.resolve(path.dirname(fullPath), rawImport);
        const relativeToModules = path.relative(root, resolved);
        if (relativeToModules.startsWith('..')) {
          continue;
        }

        const parts = relativeToModules.split(path.sep);
        const targetModule = parts[0];
        if (!targetModule || targetModule === moduleName) {
          continue;
        }

        if (parts.length === 1 || (parts.length === 2 && parts[1] === 'index.ts')) {
          continue;
        }

        violations.push(`${relative}: deep import into module '${targetModule}' via '${rawImport}'`);
      }
    }
  }
}

if (violations.length > 0) {
  process.stderr.write('Module boundary violations detected:\n');
  for (const violation of violations) {
    process.stderr.write(`- ${violation}\n`);
  }
  process.exit(1);
}

process.stdout.write('Module boundary check passed.\n');

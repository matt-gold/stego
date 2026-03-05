import fs from 'node:fs';
import path from 'node:path';

const modulesRoot = path.resolve(process.cwd(), 'src', 'modules');
const moduleNames = fs.readdirSync(modulesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const missing = [];
for (const moduleName of moduleNames) {
  const indexPath = path.join(modulesRoot, moduleName, 'index.ts');
  if (!fs.existsSync(indexPath)) {
    missing.push(`${moduleName}: missing index.ts`);
    continue;
  }

  const content = fs.readFileSync(indexPath, 'utf8');
  if (!/registerCommands\s*\(/.test(content)) {
    missing.push(`${moduleName}: index.ts does not expose registerCommands`);
  }
}

if (missing.length > 0) {
  process.stderr.write('Module API contract failures:\n');
  for (const item of missing) {
    process.stderr.write(`- ${item}\n`);
  }
  process.exit(1);
}

process.stdout.write('Module API contract check passed.\n');

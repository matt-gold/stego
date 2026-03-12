import fs from "node:fs";
import path from "node:path";

const srcRoot = path.resolve(process.cwd(), "src");
const moduleNames = fs.readdirSync(srcRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const failures = [];
for (const moduleName of moduleNames) {
  const indexPath = path.join(srcRoot, moduleName, "index.ts");
  if (!fs.existsSync(indexPath)) {
    failures.push(`${moduleName}: missing index.ts`);
  }
}

const packageIndexPath = path.join(srcRoot, "index.ts");
if (!fs.existsSync(packageIndexPath)) {
  failures.push("package: missing src/index.ts");
}

if (failures.length > 0) {
  process.stderr.write("Module API contract failures:\n");
  for (const failure of failures) {
    process.stderr.write(`- ${failure}\n`);
  }
  process.exit(1);
}

process.stdout.write("Module API contract check passed.\n");

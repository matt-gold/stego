import fs from "node:fs";
import path from "node:path";

export function writeCompiledOutput(distDir: string, projectId: string, markdown: string): string {
  fs.mkdirSync(distDir, { recursive: true });
  const outputPath = path.join(distDir, `${projectId}.md`);
  fs.writeFileSync(outputPath, markdown, "utf8");
  return outputPath;
}

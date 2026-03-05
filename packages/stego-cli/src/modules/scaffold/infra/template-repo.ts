import fs from "node:fs";
import path from "node:path";

export function listDirectoryEntries(dirPath: string): fs.Dirent[] {
  return fs.readdirSync(dirPath, { withFileTypes: true });
}

export function pathExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

export function statPath(filePath: string): fs.Stats {
  return fs.statSync(filePath);
}

export function ensureDirectory(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function copyFile(sourcePath: string, destinationPath: string): void {
  ensureDirectory(path.dirname(destinationPath));
  fs.copyFileSync(sourcePath, destinationPath);
}

export function copyDirectory(
  sourcePath: string,
  destinationPath: string,
  filter: (currentSourcePath: string) => boolean
): void {
  ensureDirectory(destinationPath);
  fs.cpSync(sourcePath, destinationPath, {
    recursive: true,
    force: true,
    filter
  });
}

export function writeTextFile(filePath: string, content: string): void {
  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
}

export function readTextFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

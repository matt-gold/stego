import fs from "node:fs";
import path from "node:path";

export function pathExists(value: string): boolean {
  return fs.existsSync(value);
}

export function isDirectory(value: string): boolean {
  try {
    return fs.statSync(value).isDirectory();
  } catch {
    return false;
  }
}

export function readJsonFile<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as T;
}

export function findNearestFileUpward(startPath: string, filename: string): string | null {
  let current = path.resolve(startPath);
  if (!pathExists(current)) {
    return null;
  }

  if (!isDirectory(current)) {
    current = path.dirname(current);
  }

  while (true) {
    const candidate = path.join(current, filename);
    if (pathExists(candidate)) {
      return candidate;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }

    current = parent;
  }
}

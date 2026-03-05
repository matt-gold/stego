import fs from "node:fs";
import path from "node:path";
import type { ManuscriptOrderEntry } from "../types.ts";

export function ensureManuscriptDir(manuscriptDir: string): void {
  fs.mkdirSync(manuscriptDir, { recursive: true });
}

export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

export function writeTextFile(filePath: string, content: string): void {
  fs.writeFileSync(filePath, content, "utf8");
}

export function listManuscriptOrderEntries(manuscriptDir: string): ManuscriptOrderEntry[] {
  if (!fs.existsSync(manuscriptDir)) {
    return [];
  }

  return fs
    .readdirSync(manuscriptDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => {
      const match = entry.name.match(/^(\d+)[-_]/);
      if (!match) {
        return null;
      }

      return {
        order: Number(match[1]),
        filename: entry.name
      };
    })
    .filter((entry): entry is ManuscriptOrderEntry => entry !== null)
    .sort((a, b) => {
      if (a.order === b.order) {
        return a.filename.localeCompare(b.filename);
      }
      return a.order - b.order;
    });
}

export function joinPath(...parts: string[]): string {
  return path.join(...parts);
}

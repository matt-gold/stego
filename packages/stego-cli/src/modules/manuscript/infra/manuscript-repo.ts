import fs from "node:fs";
import path from "node:path";
import { isBranchFile, isSupportedLeafContentFile } from "@stego-labs/shared/domain/content";
import { parseMarkdownDocument } from "@stego-labs/shared/domain/frontmatter";
import type { LeafOrderEntry } from "../types.ts";

export function ensureLeafDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

export function writeTextFile(filePath: string, content: string): void {
  fs.writeFileSync(filePath, content, "utf8");
}

export function listLeafOrderEntries(dirPath: string): LeafOrderEntry[] {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  return fs
    .readdirSync(dirPath, { withFileTypes: true })
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
    .filter((entry): entry is LeafOrderEntry => entry !== null)
    .sort((a, b) => {
      if (a.order === b.order) {
        return a.filename.localeCompare(b.filename);
      }
      return a.order - b.order;
    });
}

export function listExistingLeafIds(contentRoot: string): string[] {
  if (!fs.existsSync(contentRoot) || !fs.statSync(contentRoot).isDirectory()) {
    return [];
  }

  const ids: string[] = [];
  const seen = new Set<string>();
  const stack = [contentRoot];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    const entries = fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (!entry.isFile() || isBranchFile(fullPath) || !isSupportedLeafContentFile(fullPath)) {
        continue;
      }

      try {
        const parsed = parseMarkdownDocument(fs.readFileSync(fullPath, "utf8"));
        const id = typeof parsed.frontmatter.id === "string" ? parsed.frontmatter.id.trim().toUpperCase() : "";
        if (!id || seen.has(id)) {
          continue;
        }
        seen.add(id);
        ids.push(id);
      } catch {
        continue;
      }
    }
  }

  return ids.sort();
}

export function joinPath(...parts: string[]): string {
  return path.join(...parts);
}

import * as path from 'path';

export function normalizeFsPath(value: string): string {
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

export function toWorkspacePath(workspaceRoot: string, filePath: string): string {
  const relative = path.relative(workspaceRoot, filePath);
  if (!relative || relative.startsWith('..')) {
    return path.resolve(filePath);
  }

  return relative.split(path.sep).join('/');
}

export function uniqueResolvedPaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const entry of paths) {
    const resolved = path.resolve(entry);
    const key = normalizeFsPath(resolved);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(resolved);
  }

  return result;
}

import path from "node:path";

export function normalizeMarkdownBody(body: string, markdownPath: string, projectRoot: string): string {
  const chapterDir = path.dirname(markdownPath);
  return body.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (full, altText: string, destination: string) => {
    const trimmed = destination.trim();
    if (!trimmed || isExternalTarget(trimmed) || trimmed.startsWith("#")) {
      return full;
    }

    const resolved = path.resolve(chapterDir, trimmed);
    const relative = path.relative(projectRoot, resolved);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      return full;
    }

    return `![${altText}](${relative.split(path.sep).join("/")})`;
  });
}

function isExternalTarget(target: string): boolean {
  return /^[a-z]+:\/\//i.test(target);
}

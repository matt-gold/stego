import { parseMarkdownDocument } from "../domain/metadata.ts";
import { readMarkdownFile, resolveMarkdownPath } from "../infra/metadata-repo.ts";
import type { MetadataReadEnvelope, ReadMetadataInput } from "../types.ts";

export function readMetadata(input: ReadMetadataInput): MetadataReadEnvelope {
  const absolutePath = resolveMarkdownPath(input.cwd, input.markdownPath);
  const raw = readMarkdownFile(absolutePath, input.markdownPath);
  const parsed = parseMarkdownDocument(raw);

  return {
    ok: true,
    operation: "read",
    state: {
      path: absolutePath,
      hasFrontmatter: parsed.hasFrontmatter,
      lineEnding: parsed.lineEnding,
      frontmatter: parsed.frontmatter,
      body: parsed.body
    }
  };
}

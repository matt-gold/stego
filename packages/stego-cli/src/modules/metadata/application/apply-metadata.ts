import { CliError } from "@stego-labs/shared/contracts/cli";
import {
  normalizeFrontmatterRecord,
  parseMarkdownDocument,
  serializeMarkdownDocument
} from "../domain/metadata.ts";
import {
  readJsonPayload,
  readMarkdownFile,
  resolveMarkdownPath,
  writeMarkdownFile
} from "../infra/metadata-repo.ts";
import type { ApplyMetadataInput, MetadataApplyEnvelope } from "../types.ts";

export function applyMetadata(input: ApplyMetadataInput): MetadataApplyEnvelope {
  const absolutePath = resolveMarkdownPath(input.cwd, input.markdownPath);
  const raw = readMarkdownFile(absolutePath, input.markdownPath);
  const payload = readJsonPayload(input.inputPath, input.cwd);

  let frontmatter: ReturnType<typeof normalizeFrontmatterRecord>;
  try {
    frontmatter = normalizeFrontmatterRecord(payload.frontmatter);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CliError("INVALID_PAYLOAD", message);
  }

  const body = typeof payload.body === "string" ? payload.body : undefined;
  const hasFrontmatter = typeof payload.hasFrontmatter === "boolean"
    ? payload.hasFrontmatter
    : undefined;

  const existing = parseMarkdownDocument(raw);
  const next = {
    lineEnding: existing.lineEnding,
    hasFrontmatter: hasFrontmatter ?? (existing.hasFrontmatter || Object.keys(frontmatter).length > 0),
    frontmatter,
    body: body ?? existing.body
  };

  const nextText = serializeMarkdownDocument(next);
  const changed = nextText !== raw;
  if (changed) {
    writeMarkdownFile(absolutePath, nextText);
  }

  const reparsed = parseMarkdownDocument(nextText);
  return {
    ok: true,
    operation: "apply",
    changed,
    state: {
      path: absolutePath,
      hasFrontmatter: reparsed.hasFrontmatter,
      lineEnding: reparsed.lineEnding,
      frontmatter: reparsed.frontmatter,
      body: reparsed.body
    }
  };
}

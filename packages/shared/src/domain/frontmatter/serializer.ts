import * as yaml from "js-yaml";
import type { ParsedMarkdownDocument, FrontmatterRecord } from "./parser.ts";

export function orderFrontmatterStatusFirst(frontmatter: FrontmatterRecord): FrontmatterRecord {
  if (!Object.hasOwn(frontmatter, "status")) {
    return { ...frontmatter };
  }

  const ordered: FrontmatterRecord = {
    status: frontmatter.status
  };
  for (const [key, value] of Object.entries(frontmatter)) {
    if (key === "status") {
      continue;
    }
    ordered[key] = value;
  }

  return ordered;
}

export function serializeMarkdownDocument(parsed: ParsedMarkdownDocument): string {
  const includeFrontmatter = parsed.hasFrontmatter || Object.keys(parsed.frontmatter).length > 0;
  const normalizedBody = parsed.body.replace(/^\r?\n*/, "");

  if (!includeFrontmatter) {
    return parsed.body;
  }

  const ordered = orderFrontmatterStatusFirst(parsed.frontmatter);
  const yamlBody = yaml.dump(ordered, { lineWidth: -1, noRefs: true }).trimEnd();
  const frontmatterBlock = yamlBody.length > 0
    ? `---${parsed.lineEnding}${yamlBody}${parsed.lineEnding}---`
    : `---${parsed.lineEnding}---`;

  if (!normalizedBody) {
    return `${frontmatterBlock}${parsed.lineEnding}`;
  }

  return `${frontmatterBlock}${parsed.lineEnding}${parsed.lineEnding}${normalizedBody}`;
}

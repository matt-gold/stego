import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  normalizeFrontmatterRecord,
  parseMarkdownDocument,
  serializeMarkdownDocument
} from "./metadata-domain.ts";

type ParsedOptions = {
  _: string[];
  [key: string]: string | boolean | string[] | undefined;
};

type OutputFormat = "text" | "json";

type MetadataReadPayload = {
  ok: true;
  operation: "read";
  state: {
    path: string;
    hasFrontmatter: boolean;
    lineEnding: string;
    frontmatter: Record<string, unknown>;
    body: string;
  };
};

type MetadataApplyPayload = {
  ok: true;
  operation: "apply";
  changed: boolean;
  state: {
    path: string;
    hasFrontmatter: boolean;
    lineEnding: string;
    frontmatter: Record<string, unknown>;
    body: string;
  };
};

export async function runMetadataCommand(options: ParsedOptions, cwd: string): Promise<void> {
  const [subcommand, markdownArg] = options._;
  if (!subcommand) {
    throw new Error("Metadata subcommand is required. Use: read, apply.");
  }
  if (!markdownArg) {
    throw new Error("Markdown path is required. Use: stego metadata <subcommand> <path>.");
  }

  const outputFormat = parseOutputFormat(readString(options, "format"));
  const absolutePath = path.resolve(cwd, markdownArg);
  const raw = readFile(absolutePath, markdownArg);

  switch (subcommand) {
    case "read": {
      const parsed = parseMarkdownDocument(raw);
      emit({
        ok: true,
        operation: "read",
        state: {
          path: absolutePath,
          hasFrontmatter: parsed.hasFrontmatter,
          lineEnding: parsed.lineEnding,
          frontmatter: parsed.frontmatter,
          body: parsed.body
        }
      }, outputFormat);
      return;
    }
    case "apply": {
      const inputPath = requireInputPath(options);
      const payload = readInputPayload(inputPath, cwd);
      const frontmatter = normalizeFrontmatterRecord(payload.frontmatter);
      const body = typeof payload.body === "string" ? payload.body : undefined;
      const hasFrontmatter = typeof payload.hasFrontmatter === "boolean" ? payload.hasFrontmatter : undefined;

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
        fs.writeFileSync(absolutePath, nextText, "utf8");
      }

      const reparsed = parseMarkdownDocument(nextText);
      emit({
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
      }, outputFormat);
      return;
    }
    default:
      throw new Error(`Unknown metadata subcommand '${subcommand}'. Use: read, apply.`);
  }
}

function emit(payload: MetadataReadPayload | MetadataApplyPayload, format: OutputFormat): void {
  if (format === "json") {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  if (payload.operation === "read") {
    process.stdout.write(
      `Read metadata for ${payload.state.path} (${Object.keys(payload.state.frontmatter).length} keys).\n`
    );
    return;
  }

  process.stdout.write(
    `${payload.changed ? "Updated" : "No changes for"} metadata in ${payload.state.path}.\n`
  );
}

function parseOutputFormat(raw: string | undefined): OutputFormat {
  if (!raw || raw === "text") {
    return "text";
  }
  if (raw === "json") {
    return "json";
  }
  throw new Error("Invalid --format value. Use 'text' or 'json'.");
}

function readString(options: ParsedOptions, key: string): string | undefined {
  const value = options[key];
  return typeof value === "string" ? value : undefined;
}

function requireInputPath(options: ParsedOptions): string {
  const inputPath = readString(options, "input");
  if (!inputPath) {
    throw new Error("--input <path|-> is required for 'metadata apply'.");
  }
  return inputPath;
}

function readInputPayload(inputPath: string, cwd: string): Record<string, unknown> {
  const raw = inputPath === "-"
    ? fs.readFileSync(process.stdin.fd, "utf8")
    : fs.readFileSync(path.resolve(cwd, inputPath), "utf8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Input payload is not valid JSON.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Input payload must be a JSON object.");
  }

  return parsed as Record<string, unknown>;
}

function readFile(filePath: string, originalArg: string): string {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      throw new Error();
    }
  } catch {
    throw new Error(`Markdown file not found: ${originalArg}`);
  }

  return fs.readFileSync(filePath, "utf8");
}

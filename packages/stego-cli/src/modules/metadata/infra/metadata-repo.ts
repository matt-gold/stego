import fs from "node:fs";
import path from "node:path";
import { CliError } from "@stego/shared/contracts/cli";
import type { MetadataOutputFormat } from "../types.ts";

export function parseMetadataOutputFormat(rawValue: unknown): MetadataOutputFormat {
  if (rawValue === undefined || rawValue === null || rawValue === "text") {
    return "text";
  }
  if (rawValue === "json") {
    return "json";
  }

  throw new CliError("INVALID_USAGE", "Invalid --format value. Use 'text' or 'json'.");
}

export function resolveMarkdownPath(cwd: string, markdownPath: string): string {
  return path.resolve(cwd, markdownPath);
}

export function readMarkdownFile(absolutePath: string, originalArg: string): string {
  try {
    const stat = fs.statSync(absolutePath);
    if (!stat.isFile()) {
      throw new Error("Not a file");
    }
  } catch {
    throw new CliError("INVALID_USAGE", `Markdown file not found: ${originalArg}`);
  }

  try {
    return fs.readFileSync(absolutePath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CliError("INVALID_USAGE", `Unable to read markdown file: ${message}`);
  }
}

export function writeMarkdownFile(absolutePath: string, contents: string): void {
  try {
    fs.writeFileSync(absolutePath, contents, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CliError("WRITE_FAILURE", `Failed to update markdown file: ${message}`);
  }
}

export function readJsonPayload(inputPath: string, cwd: string): Record<string, unknown> {
  let rawPayload = "";

  try {
    rawPayload = inputPath === "-"
      ? fs.readFileSync(0, "utf8")
      : fs.readFileSync(path.resolve(cwd, inputPath), "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CliError("INVALID_PAYLOAD", `Unable to read input payload: ${message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawPayload);
  } catch {
    throw new CliError("INVALID_PAYLOAD", "Input payload is not valid JSON.");
  }

  if (!isPlainObject(parsed)) {
    throw new CliError("INVALID_PAYLOAD", "Input payload must be a JSON object.");
  }

  return parsed;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

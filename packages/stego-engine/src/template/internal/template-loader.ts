import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { assertTemplateModule } from "./evaluate-template.ts";
import type { StegoTemplate } from "../public/types.ts";

export type LoadedTemplate = {
  template: StegoTemplate;
  cleanup: () => void;
};

export async function loadTemplateFromFile(templatePath: string): Promise<LoadedTemplate> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stego-template-"));
  const outfile = path.join(tempDir, "template.mjs");
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const authoringEntry = resolveSourceOrBuiltModule(
    path.join(sourceRoot, "template/public/authoring"),
    path.join(sourceRoot, "template/index")
  );
  const jsxRuntimeEntry = resolveSourceOrBuiltModule(path.join(sourceRoot, "template/internal/jsx-runtime"));
  const jsxDevRuntimeEntry = resolveSourceOrBuiltModule(path.join(sourceRoot, "template/internal/jsx-dev-runtime"));

  await build({
    entryPoints: [templatePath],
    outfile,
    bundle: true,
    format: "esm",
    platform: "node",
    sourcemap: "inline",
    jsx: "automatic",
    jsxImportSource: "stego-engine",
    alias: {
      "stego-engine": authoringEntry,
      "stego-engine/jsx-runtime": jsxRuntimeEntry,
      "stego-engine/jsx-dev-runtime": jsxDevRuntimeEntry
    }
  });

  const imported = await import(pathToFileURL(outfile).href);
  return {
    template: assertTemplateModule(imported.default),
    cleanup: () => fs.rmSync(tempDir, { recursive: true, force: true })
  };
}

function resolveSourceOrBuiltModule(...candidatesWithoutExtension: string[]): string {
  for (const candidate of candidatesWithoutExtension) {
    for (const extension of [".ts", ".js"] as const) {
      const fullPath = `${candidate}${extension}`;
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
  }
  throw new Error(`Could not resolve template runtime module from: ${candidatesWithoutExtension.join(", ")}`);
}

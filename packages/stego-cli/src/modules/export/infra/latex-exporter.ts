import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { ExportRunArgs, Exporter } from "../domain/exporter.ts";

export type PreparedLatexPandocRun = {
  args: string[];
  requireXelatex: boolean;
};

function hasPandoc(): boolean {
  const result = spawnSync("pandoc", ["--version"], { stdio: "ignore" });
  return result.status === 0;
}

function resolveBundledFile(relativePathFromPackageRoot: string): string | undefined {
  let current = path.dirname(fileURLToPath(import.meta.url));
  while (true) {
    const candidate = path.join(current, relativePathFromPackageRoot);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

function resolveRequiredFilters(requiredFilters: string[] | undefined): string[] {
  const resolved = requiredFilters && requiredFilters.length > 0 ? requiredFilters : ["image-layout"];
  return Array.from(new Set(resolved));
}

export function prepareLatexPandocRun(args: ExportRunArgs): PreparedLatexPandocRun {
  const preparedArgs = [args.inputPath, "-o", args.outputPath];
  if (args.inputFormat) {
    preparedArgs.push("--from", args.inputFormat);
  }
  for (const filterId of resolveRequiredFilters(args.requiredFilters)) {
    const luaFilter = resolveBundledFile(path.join("filters", `${filterId}.lua`));
    if (luaFilter) {
      preparedArgs.push("--lua-filter", luaFilter);
    }
  }
  if (args.resourcePaths && args.resourcePaths.length > 0) {
    preparedArgs.push(`--resource-path=${args.resourcePaths.join(path.delimiter)}`);
  }
  if (args.extraArgs && args.extraArgs.length > 0) {
    preparedArgs.push(...args.extraArgs);
  }

  return {
    args: preparedArgs,
    requireXelatex: args.postprocess?.pdf?.requiresXelatex === true
  };
}

export function runPandoc(args: string[], cwd?: string): void {
  const result = spawnSync("pandoc", args, {
    encoding: "utf8",
    cwd: cwd || undefined
  });

  if (result.status !== 0) {
    const stderr = (result.stderr || "").trim();
    const stdout = (result.stdout || "").trim();
    const details = stderr || stdout || "Unknown pandoc error";
    throw new Error(`pandoc export failed: ${details}`);
  }
}

export function createLatexExporter(): Exporter {
  return {
    id: "latex",
    description: "Export LaTeX with pandoc",
    canRun() {
      if (!hasPandoc()) {
        return { ok: false, reason: "pandoc is not installed. Install pandoc to enable docx/pdf/epub/latex exports." };
      }
      return { ok: true };
    },
    async run(args) {
      fs.mkdirSync(path.dirname(args.outputPath), { recursive: true });
      const prepared = prepareLatexPandocRun(args);
      runPandoc(prepared.args, args.cwd);
      return { outputPath: args.outputPath };
    }
  };
}

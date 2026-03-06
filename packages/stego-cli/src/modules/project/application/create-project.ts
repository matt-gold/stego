import fs from "node:fs";
import path from "node:path";
import { CliError } from "../../../../../shared/src/contracts/cli/index.ts";
import { isValidProjectId } from "../../../../../shared/src/domain/project/index.ts";
import type { CreateProjectInput, CreateProjectResult } from "../types.ts";
import { ensureDirectory, pathExists, writeTextFile } from "../infra/project-repo.ts";

const PROJECT_EXTENSION_RECOMMENDATIONS = [
  "matt-gold.stego-extension",
  "matt-gold.saurus-extension",
  "streetsidesoftware.code-spell-checker"
] as const;

const PROSE_MARKDOWN_EDITOR_SETTINGS: Record<string, unknown> = {
  "[markdown]": {
    "editor.fontFamily": "Inter, Helvetica Neue, Helvetica, Arial, sans-serif",
    "editor.fontSize": 17,
    "editor.lineHeight": 28,
    "editor.wordWrap": "wordWrapColumn",
    "editor.wordWrapColumn": 72,
    "editor.lineNumbers": "off"
  },
  "markdown.preview.fontFamily": "Inter, Helvetica Neue, Helvetica, Arial, sans-serif"
};

export function createProject(input: CreateProjectInput): CreateProjectResult {
  const projectId = (input.projectId || "").trim();
  if (!projectId) {
    throw new CliError("INVALID_USAGE", "Project id is required. Use --project/-p <project-id>.");
  }

  if (!isValidProjectId(projectId)) {
    throw new CliError("INVALID_USAGE", "Project id must match /^[a-z0-9][a-z0-9-]*$/.");
  }

  const projectRoot = path.join(input.workspace.repoRoot, input.workspace.config.projectsDir, projectId);
  if (pathExists(projectRoot)) {
    throw new CliError("INVALID_USAGE", `Project already exists: ${projectRoot}`);
  }

  const manuscriptDir = path.join(projectRoot, input.workspace.config.chapterDir);
  const spineDir = path.join(projectRoot, input.workspace.config.spineDir);
  const notesDir = path.join(projectRoot, input.workspace.config.notesDir);
  const assetsDir = path.join(projectRoot, "assets");
  const distDir = path.join(projectRoot, input.workspace.config.distDir);

  ensureDirectory(manuscriptDir);
  ensureDirectory(spineDir);
  ensureDirectory(notesDir);
  ensureDirectory(assetsDir);
  ensureDirectory(distDir);

  const projectJsonPath = path.join(projectRoot, "stego-project.json");
  writeTextFile(
    projectJsonPath,
    `${JSON.stringify(
      {
        id: projectId,
        title: input.title?.trim() || toDisplayTitle(projectId),
        requiredMetadata: ["status"],
        compileStructure: {
          levels: [
            {
              key: "chapter",
              label: "Chapter",
              titleKey: "chapter_title",
              injectHeading: true,
              headingTemplate: "{label} {value}: {title}",
              pageBreak: "between-groups"
            }
          ]
        }
      },
      null,
      2
    )}\n`
  );

  const projectPackagePath = path.join(projectRoot, "package.json");
  writeTextFile(
    projectPackagePath,
    `${JSON.stringify(
      {
        name: `stego-project-${projectId}`,
        private: true,
        scripts: {
          new: "npx --no-install stego new",
          "spine:new": "npx --no-install stego spine new",
          "spine:new-category": "npx --no-install stego spine new-category",
          lint: "npx --no-install stego lint",
          validate: "npx --no-install stego validate",
          build: "npx --no-install stego build",
          "check-stage": "npx --no-install stego check-stage",
          export: "npx --no-install stego export"
        }
      },
      null,
      2
    )}\n`
  );

  const starterManuscriptPath = path.join(manuscriptDir, "100-hello-world.md");
  writeTextFile(
    starterManuscriptPath,
    `---
status: draft
chapter: 1
chapter_title: Hello World
---

# Hello World

Start writing here.
`
  );

  const charactersDir = path.join(spineDir, "characters");
  ensureDirectory(charactersDir);

  const charactersCategoryPath = path.join(charactersDir, "_category.md");
  writeTextFile(
    charactersCategoryPath,
    `---
label: Characters
---

# Characters

`
  );

  const charactersEntryPath = path.join(charactersDir, "example-character.md");
  writeTextFile(charactersEntryPath, "# Example Character\n\n");

  const assetsReadmePath = path.join(assetsDir, "README.md");
  writeTextFile(
    assetsReadmePath,
    `# Assets

Store manuscript images in this directory (or subdirectories).

Use standard Markdown image syntax in manuscript files, typically with paths like:

\`\`\`md
![Map](../assets/maps/city-plan.png)
\`\`\`

Optional manuscript frontmatter image settings:

\`\`\`json
// stego-project.json
{
  "images": {
    "layout": "block",
    "align": "center",
    "width": "50%"
  }
}
\`\`\`

\`\`\`yaml
# manuscript frontmatter overrides
images:
  assets/maps/city-plan.png:
    layout: inline
    align: left
    width: 100%
\`\`\`

Manuscript frontmatter \`images\` is for per-path overrides.
Global defaults belong in \`stego-project.json\` under \`images\`.

`
  );

  const projectExtensionsPath = ensureProjectExtensionsRecommendations(projectRoot);
  let projectSettingsPath: string | undefined;
  if (input.enableProseFont) {
    projectSettingsPath = writeProseEditorSettingsForProject(projectRoot);
  }

  return {
    projectId,
    projectPath: path.relative(input.workspace.repoRoot, projectRoot),
    files: [
      path.relative(input.workspace.repoRoot, projectJsonPath),
      path.relative(input.workspace.repoRoot, projectPackagePath),
      path.relative(input.workspace.repoRoot, starterManuscriptPath),
      path.relative(input.workspace.repoRoot, charactersCategoryPath),
      path.relative(input.workspace.repoRoot, charactersEntryPath),
      path.relative(input.workspace.repoRoot, assetsReadmePath),
      path.relative(input.workspace.repoRoot, projectExtensionsPath),
      ...(projectSettingsPath ? [path.relative(input.workspace.repoRoot, projectSettingsPath)] : [])
    ]
  };
}

export function parseProjectOutputFormat(raw: string | undefined): "text" | "json" {
  if (!raw || raw === "text") {
    return "text";
  }
  if (raw === "json") {
    return "json";
  }
  throw new CliError("INVALID_USAGE", "Invalid --format value. Use 'text' or 'json'.");
}

export function parseProseFontMode(raw: string | undefined): "yes" | "no" | "prompt" {
  const normalized = (raw || "prompt").trim().toLowerCase();
  if (normalized === "yes" || normalized === "true" || normalized === "y") {
    return "yes";
  }
  if (normalized === "no" || normalized === "false" || normalized === "n") {
    return "no";
  }
  if (normalized === "prompt" || normalized === "ask") {
    return "prompt";
  }
  throw new CliError("INVALID_USAGE", "Invalid --prose-font value. Use 'yes', 'no', or 'prompt'.");
}

function ensureProjectExtensionsRecommendations(projectRoot: string): string {
  const vscodeDir = path.join(projectRoot, ".vscode");
  const extensionsPath = path.join(vscodeDir, "extensions.json");
  ensureDirectory(vscodeDir);

  let existingRecommendations: string[] = [];
  if (pathExists(extensionsPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(extensionsPath, "utf8")) as Record<string, unknown>;
      if (Array.isArray(parsed.recommendations)) {
        existingRecommendations = parsed.recommendations.filter((value): value is string => typeof value === "string");
      }
    } catch {
      existingRecommendations = [];
    }
  }

  const mergedRecommendations = [
    ...new Set<string>([...PROJECT_EXTENSION_RECOMMENDATIONS, ...existingRecommendations])
  ];
  writeTextFile(
    extensionsPath,
    `${JSON.stringify({ recommendations: mergedRecommendations }, null, 2)}\n`
  );
  return extensionsPath;
}

function writeProseEditorSettingsForProject(projectRoot: string): string {
  const vscodeDir = path.join(projectRoot, ".vscode");
  const settingsPath = path.join(vscodeDir, "settings.json");
  ensureDirectory(vscodeDir);

  let existingSettings: Record<string, unknown> = {};
  if (pathExists(settingsPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf8")) as Record<string, unknown>;
      if (isPlainObject(parsed)) {
        existingSettings = parsed;
      }
    } catch {
      existingSettings = {};
    }
  }

  const proseMarkdownSettings = isPlainObject(PROSE_MARKDOWN_EDITOR_SETTINGS["[markdown]"])
    ? (PROSE_MARKDOWN_EDITOR_SETTINGS["[markdown]"] as Record<string, unknown>)
    : {};

  const existingMarkdownSettings = isPlainObject(existingSettings["[markdown]"])
    ? (existingSettings["[markdown]"] as Record<string, unknown>)
    : {};

  const nextSettings: Record<string, unknown> = {
    ...existingSettings,
    "[markdown]": {
      ...existingMarkdownSettings,
      ...proseMarkdownSettings
    },
    "markdown.preview.fontFamily": PROSE_MARKDOWN_EDITOR_SETTINGS["markdown.preview.fontFamily"]
  };

  writeTextFile(settingsPath, `${JSON.stringify(nextSettings, null, 2)}\n`);
  return settingsPath;
}

function toDisplayTitle(value: string): string {
  return value
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

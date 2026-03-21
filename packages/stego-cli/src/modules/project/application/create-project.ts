import fs from "node:fs";
import path from "node:path";
import { CliError } from "@stego-labs/shared/contracts/cli";
import { isValidProjectId } from "@stego-labs/shared/domain/project";
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

  const contentDir = path.join(projectRoot, input.workspace.config.contentDir);
  const manuscriptDir = path.join(contentDir, "manuscript");
  const referenceDir = path.join(contentDir, "reference");
  const notesDir = path.join(projectRoot, input.workspace.config.notesDir);
  const assetsDir = path.join(projectRoot, "assets");
  const distDir = path.join(projectRoot, input.workspace.config.distDir);
  const templatesDir = path.join(projectRoot, "templates");

  ensureDirectory(contentDir);
  ensureDirectory(manuscriptDir);
  ensureDirectory(referenceDir);
  ensureDirectory(notesDir);
  ensureDirectory(assetsDir);
  ensureDirectory(distDir);
  ensureDirectory(templatesDir);

  const projectJsonPath = path.join(projectRoot, "stego-project.json");
  writeTextFile(
    projectJsonPath,
    `${JSON.stringify(
      {
        id: projectId,
        title: input.title?.trim() || toDisplayTitle(projectId)
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
          lint: "npx --no-install stego lint",
          validate: "npx --no-install stego validate",
          build: "npx --no-install stego build",
          "check-stage": "npx --no-install stego check-stage",
          export: "npx --no-install stego export",
          typecheck: "tsc -p tsconfig.json --noEmit"
        }
      },
      null,
      2
    )}\n`
  );

  const projectTsconfigPath = path.join(projectRoot, "tsconfig.json");
  writeTextFile(
    projectTsconfigPath,
    `${JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          noEmit: true,
          allowImportingTsExtensions: true,
          types: ["node"],
          jsx: "react-jsx",
          jsxImportSource: "@stego-labs/engine",
          skipLibCheck: true
        },
        include: ["templates/**/*.tsx"]
      },
      null,
      2
    )}\n`
  );

  const manuscriptBranchPath = path.join(manuscriptDir, "_branch.md");
  writeTextFile(
    manuscriptBranchPath,
    `---
label: Manuscript
leafPolicy:
  requiredMetadata:
    - status
---

Ordered draft leaves live here.
`
  );

  const referenceBranchPath = path.join(referenceDir, "_branch.md");
  writeTextFile(
    referenceBranchPath,
    `---
label: Reference
---

Reference leaves live here.
`
  );

  const starterManuscriptPath = path.join(manuscriptDir, "100-hello-world.md");
  writeTextFile(
    starterManuscriptPath,
    `---
id: CH-HELLO-WORLD
status: draft
chapter: 1
chapter_title: Hello World
---

# Hello World

Start writing here.
`
  );

  const starterTemplatePath = path.join(templatesDir, "book.template.tsx");
  const starterEbookTemplatePath = path.join(templatesDir, "ebook.template.tsx");
  const starterManuscriptTemplatePath = path.join(templatesDir, "manuscript.template.tsx");
  writeTextFile(starterTemplatePath, buildBookTemplateSource());
  writeTextFile(starterEbookTemplatePath, buildEbookTemplateSource());
  writeTextFile(starterManuscriptTemplatePath, buildManuscriptTemplateSource());

  const assetsReadmePath = path.join(assetsDir, "README.md");
  writeTextFile(
    assetsReadmePath,
    `# Assets

Store content images in this directory (or subdirectories).

Use standard Markdown image syntax in content files, typically with paths like:

\`\`\`md
![Map](../assets/maps/city-plan.png)
\`\`\`

Optional leaf frontmatter image settings:

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
# leaf frontmatter overrides
images:
  assets/maps/city-plan.png:
    layout: inline
    align: left
    width: 100%
\`\`\`

Leaf frontmatter \`images\` is for per-path overrides.
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
      path.relative(input.workspace.repoRoot, projectTsconfigPath),
      path.relative(input.workspace.repoRoot, manuscriptBranchPath),
      path.relative(input.workspace.repoRoot, referenceBranchPath),
      path.relative(input.workspace.repoRoot, starterManuscriptPath),
      path.relative(input.workspace.repoRoot, starterTemplatePath),
      path.relative(input.workspace.repoRoot, starterEbookTemplatePath),
      path.relative(input.workspace.repoRoot, starterManuscriptTemplatePath),
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

function buildBookTemplateSource(): string {
  return `import { defineTemplate } from "@stego-labs/engine";

export default defineTemplate(
  { targets: ["docx", "pdf", "latex"] },
  (ctx, Stego) => {
    const generatedAt = new Date().toISOString();
    const chapterLeaves = ctx.allLeaves.filter((leaf) => leaf.metadata.kind !== "reference");
    const chapterGroups = Stego.splitBy(chapterLeaves, (leaf) => asString(leaf.metadata.chapter));
    const tocEntries = chapterGroups
      .filter(hasTitledBoundary)
      .map((group) => {
        const heading = formatChapterHeading(group.value, group.first.metadata.chapter_title);
        return \`- [\${heading}](#\${slugify(heading)})\`;
      });

    return (
      <Stego.Document page={{ size: "6x9", margin: "0.75in" }}>
        <Stego.PageTemplate footer={{ right: <Stego.PageNumber /> }} />

        <Stego.Markdown source={\`<!-- generated: \${generatedAt} -->\`} />
        <Stego.Heading level={1}>
          {String(ctx.project.metadata.title ?? ctx.project.id)}
        </Stego.Heading>

        {ctx.project.metadata.subtitle ? (
          <Stego.Paragraph spaceAfter={18}>
            {String(ctx.project.metadata.subtitle)}
          </Stego.Paragraph>
        ) : null}

        {ctx.project.metadata.author ? (
          <Stego.Paragraph spaceAfter={24}>
            {String(ctx.project.metadata.author)}
          </Stego.Paragraph>
        ) : null}

        <Stego.Markdown source={\`Generated: \${generatedAt}\`} />
        <Stego.Heading level={2}>Table of Contents</Stego.Heading>
        {tocEntries.length > 0 ? <Stego.Markdown source={tocEntries.join("\\n")} /> : null}

        {chapterGroups.map((group, index) => (
          <Stego.Section role="chapter" id={group.value ? \`chapter-\${group.value}\` : undefined}>
            {group.value && index > 0 ? <Stego.PageBreak /> : null}
            {group.value ? (
              <Stego.Heading level={2} spaceBefore={48} spaceAfter={24}>
                {formatChapterHeading(group.value, group.first.metadata.chapter_title)}
              </Stego.Heading>
            ) : null}
            {group.items.map((leaf) => (
              <>
                <Stego.Markdown
                  source={\`<!-- source: \${leaf.relativePath} | order: \${leaf.order} | status: \${String(leaf.metadata.status ?? "")} -->\`}
                />
                <Stego.Markdown leaf={leaf} />
              </>
            ))}
          </Stego.Section>
        ))}
      </Stego.Document>
    );
  }
);

function asString(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return undefined;
}

function formatChapterHeading(value: string, rawTitle: unknown): string {
  const title = typeof rawTitle === "string" ? rawTitle.trim() : "";
  return title ? \`Chapter \${value}: \${title}\` : \`Chapter \${value}\`;
}

function hasTitledBoundary<T extends { value?: string }>(group: T): group is T & { value: string } {
  return typeof group.value === "string" && group.value.trim().length > 0;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\\s-]/g, "")
    .trim()
    .replace(/\\s+/g, "-");
}
`;
}

function buildEbookTemplateSource(): string {
  return `import { defineTemplate } from "@stego-labs/engine";

export default defineTemplate(
  { targets: ["epub"] },
  (ctx, Stego) => {
    const chapterLeaves = ctx.allLeaves.filter((leaf) => leaf.metadata.kind !== "reference");
    const chapterGroups = Stego.splitBy(chapterLeaves, (leaf) => asString(leaf.metadata.chapter));

    return (
      <Stego.Document>
        <Stego.Heading level={1}>{String(ctx.project.metadata.title ?? ctx.project.id)}</Stego.Heading>

        {ctx.project.metadata.subtitle ? (
          <Stego.Paragraph spaceAfter={18}>
            {String(ctx.project.metadata.subtitle)}
          </Stego.Paragraph>
        ) : null}

        {chapterGroups.map((group) => (
          <Stego.Section role="chapter" id={group.value ? \`chapter-\${group.value}\` : undefined}>
            {group.value ? (
              <Stego.Heading level={2} spaceBefore={36} spaceAfter={18}>
                {formatChapterHeading(group.value, group.first.metadata.chapter_title)}
              </Stego.Heading>
            ) : null}
            {group.items.map((leaf) => <Stego.Markdown leaf={leaf} />)}
          </Stego.Section>
        ))}
      </Stego.Document>
    );
  }
);

function asString(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return undefined;
}

function formatChapterHeading(value: string, rawTitle: unknown): string {
  const title = typeof rawTitle === "string" ? rawTitle.trim() : "";
  return title ? \`Chapter \${value}: \${title}\` : \`Chapter \${value}\`;
}
`;
}

function buildManuscriptTemplateSource(): string {
  return `import { defineTemplate } from "@stego-labs/engine";

export default defineTemplate(
  { targets: ["docx"] },
  (ctx, Stego) => {
    const chapterLeaves = ctx.allLeaves.filter((leaf) => leaf.metadata.kind !== "reference");
    const chapterGroups = Stego.splitBy(chapterLeaves, (leaf) => asString(leaf.metadata.chapter));

    return (
      <Stego.Document
        page={{ size: "letter", margin: "1in" }}
        bodyStyle={{
          fontFamily: "Times New Roman",
          fontSize: "12pt",
          lineSpacing: 2,
          spaceBefore: 0,
          spaceAfter: 0,
        }}
      >
        <Stego.Section>
          <Stego.Paragraph align="center" fontSize="12pt" spaceBefore="216pt" spaceAfter="24pt">
            {String(ctx.project.metadata.title ?? ctx.project.id).toUpperCase()}
          </Stego.Paragraph>

          {ctx.project.metadata.author ? (
            <Stego.Paragraph align="center" fontSize="12pt" spaceAfter="24pt">
              by
            </Stego.Paragraph>
          ) : null}

          {ctx.project.metadata.author ? (
            <Stego.Paragraph align="center" fontSize="12pt">
              {String(ctx.project.metadata.author)}
            </Stego.Paragraph>
          ) : null}
        </Stego.Section>

        {chapterGroups.length > 0 ? <Stego.PageBreak /> : null}

        {chapterGroups.map((group, index) => (
          <Stego.Section role="chapter" bodyStyle={{ firstLineIndent: "0.5in" }}>
            {index > 0 ? <Stego.PageBreak /> : null}
            {group.value ? (
              <>
                <Stego.Paragraph align="center" fontSize="12pt" spaceBefore="144pt" spaceAfter="24pt">
                  {formatChapterNumber(group.value)}
                </Stego.Paragraph>
                {hasChapterTitle(group.first.metadata.chapter_title) ? (
                  <Stego.Paragraph align="center" fontSize="12pt" spaceAfter="24pt">
                    {String(group.first.metadata.chapter_title).trim().toUpperCase()}
                  </Stego.Paragraph>
                ) : null}
              </>
            ) : null}
            {group.items.map((leaf) => <Stego.Markdown leaf={leaf} />)}
          </Stego.Section>
        ))}
      </Stego.Document>
    );
  }
);

function asString(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return undefined;
}

function hasChapterTitle(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function formatChapterNumber(value: string): string {
  return \`Chapter \${value}\`;
}
`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

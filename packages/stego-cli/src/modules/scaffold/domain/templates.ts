export const PROSE_FONT_PROMPT = "Switch workspace to proportional (prose-style) font? (recommended)";
export const COMMENT_AUTHOR_PROMPT = "Default comment author for stego.comments.author?";

export const SCAFFOLD_GITIGNORE_CONTENT = `node_modules/
/dist/
.DS_Store
*.log
projects/*/dist/*
!projects/*/dist/.gitkeep
projects/*/.vscode/settings.json
.vscode/settings.json
`;

export const SCAFFOLD_README_CONTENT = `# Stego Workspace

This directory is a Stego writing workspace (a monorepo for one or more writing projects).

## What was scaffolded

- \`stego.config.json\` workspace configuration
- \`projects/\` demo projects (\`stego-docs\` and \`fiction-example\`)
- per-project \`assets/\` directories for manuscript images
- root \`package.json\` scripts for Stego commands
- root \`.vscode/tasks.json\` tasks for common workflows

Full documentation lives in \`projects/stego-docs\`.

## First run

\`\`\`bash
npm install
stego list-projects
\`\`\`

## Run commands for a specific project (from workspace root)

\`\`\`bash
stego validate -p fiction-example
stego build -p fiction-example
stego check-stage -p fiction-example --stage revise
stego export -p fiction-example --format md
stego new -p fiction-example
\`\`\`

## Work inside one project

Each project also has local scripts, so you can run commands from inside a project directory:

\`\`\`bash
cd projects/fiction-example
npm run validate
npm run build
\`\`\`

## VS Code recommendation

When you are actively working on one project, open that project directory directly in VS Code (for example \`projects/fiction-example\`).

This keeps your editor context focused and applies the project's recommended extensions (including Stego + Saurus) for that project.

## Create a new project

\`\`\`bash
stego new-project -p my-book --title "My Book"
\`\`\`

## Add a new manuscript file

\`\`\`bash
stego new -p fiction-example
\`\`\`
`;

export const SCAFFOLD_AGENTS_CONTENT = `# AGENTS.md

## Purpose

This workspace is designed to be AI-friendly for writing workflows.

## Canonical CLI Interface

- Run \`stego --help\` for the full command reference.
- Run \`stego --version\` to confirm which CLI is active.
- Run project docs commands in \`projects/stego-docs\` when available.

## CLI Resolution Rules

- Prefer local CLI over global CLI:
  - \`npm exec -- stego ...\`
  - \`npx --no-install stego ...\`
- At the start of mutation tasks, run \`stego --version\` and report the version used.

## Workspace Discovery Checklist

1. Confirm workspace root contains \`stego.config.json\`.
2. Run \`stego list-projects\`.
3. Use explicit \`--project/-p <id>\` for project-scoped commands.

## CLI-First Policy (Required)

When asked to edit Stego project content, use documented Stego CLI commands first.

Typical targets:

- manuscript files
- spine categories and entries
- frontmatter metadata
- comments
- stage/build/export workflows

Preferred commands include:

- \`stego new\`
- \`stego spine read\`
- \`stego spine new-category\`
- \`stego spine new\`
- \`stego metadata read\`
- \`stego metadata apply\`
- \`stego comments ...\`

## Machine-Mode Output

- For automation and integrations, prefer \`--format json\` and parse structured output.
- Use text output only for human-facing summaries.

## Mutation Protocol

1. Read current state first (\`metadata read\`, \`spine read\`, \`comments read\`).
2. Mutate via CLI commands.
3. Verify after writes (\`stego validate --project/-p <id>\` and relevant read commands).

## Manual Edit Fallback

Manual file edits are a last resort.

If manual edits are required, the agent must:

1. warn that CLI was bypassed,
2. explain why CLI could not be used, and
3. list which files were manually edited.

## Failure Contract

When CLI fails:

1. show the attempted command,
2. summarize the error briefly,
3. report the recovery attempt, and
4. if fallback is required, apply the Manual Edit Fallback policy.

## Validation Expectations

After mutations, run relevant checks when feasible (for example \`stego validate --project/-p <id>\`) and report results.

## Scope Guardrails

- Do not manually edit \`dist/\` outputs or compiled export artifacts.
- Do not modify files outside the requested project scope unless the user explicitly asks.

## Task To Command Quick Map

- New manuscript: \`stego new --project/-p <id> [--filename <name>]\`
- Read spine: \`stego spine read --project/-p <id> --format json\`
- New spine category: \`stego spine new-category --project/-p <id> --key <category>\`
- New spine entry: \`stego spine new --project/-p <id> --category <category> [--filename <path>]\`
- Read metadata: \`stego metadata read <markdown-path> --format json\`
- Apply metadata: \`stego metadata apply <markdown-path> --input <path|-> --format json\`
- Read comments: \`stego comments read <manuscript> --format json\`
- Mutate comments: \`stego comments add|reply|set-status|delete|clear-resolved|sync-anchors ... --format json\`
`;

export const PROSE_MARKDOWN_EDITOR_SETTINGS: Record<string, unknown> = {
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

export const PROJECT_EXTENSION_RECOMMENDATIONS = [
  "matt-gold.stego-extension",
  "matt-gold.saurus-extension",
  "streetsidesoftware.code-spell-checker"
] as const;

# AGENTS.md

## Purpose

This repository is designed to be AI-friendly for writing workflows. Agents should default to Stego CLI operations whenever possible.

## Canonical CLI Locations

- User-facing CLI docs: `packages/stego-cli/README.md`
- Full command index: `stego --help`
- CLI source entrypoint: `packages/stego-cli/tools/stego-cli.ts`

## CLI Resolution Rules

- Prefer local CLI over global CLI:
  - `npm exec -- stego ...`
  - `npx --no-install stego ...`
- At the start of mutation tasks, run `stego --version` and report the version used.

## Workspace Discovery Checklist

1. Confirm workspace root contains `stego.config.json`.
2. Run `stego list-projects`.
3. Use explicit `--project <id>` for project-scoped commands.

## CLI-First Policy (Required)

When asked to edit Stego project content, **attempt to use documented Stego CLI commands first**.

Typical targets:

- manuscript files
- spine categories and entries
- frontmatter metadata
- comments
- stage/build/export workflows

Preferred commands include:

- `stego new`
- `stego spine read`
- `stego spine new-category`
- `stego spine new`
- `stego metadata read`
- `stego metadata apply`
- `stego comments ...`

## Machine-Mode Output

- For automation and integrations, prefer `--format json` and parse structured output.
- Use text output only for human-facing summaries.

## Mutation Protocol

1. Read current state first (`metadata read`, `spine read`, `comments read`).
2. Mutate via CLI commands.
3. Verify after writes (`stego validate --project <id>` and relevant read commands).

## Manual Edit Fallback

Manual edits to configuration files, metadata frontmatter, or other stego-managed content is a last resort. Use them only when:

1. no documented CLI command exists for the requested operation, or
2. the CLI command fails and cannot be reasonably recovered.

If manual edits to stego configuration are required, the agent must:

1. explicitly warn the user that CLI was bypassed,
2. explain why CLI could not be used, and
3. list which files were manually edited.

## Failure Contract

When CLI fails:

1. show the attempted command,
2. summarize the error briefly,
3. report the recovery attempt, and
4. if fallback is required, apply the Manual Edit Fallback policy.

## Validation Expectations

After CLI or manual mutations, run relevant checks when feasible (for example `stego validate --project <id>`) and report results.

## Scope Guardrails

- Do not manually edit `dist/` outputs or compiled export artifacts.
- Do not modify files outside the requested project scope unless the user explicitly asks.

## Task To Command Quick Map

- New manuscript: `stego new --project <id> [--filename <name>]`
- Read spine: `stego spine read --project <id> --format json`
- New spine category: `stego spine new-category --project <id> --key <category>`
- New spine entry: `stego spine new --project <id> --category <category> [--filename <path>]`
- Read metadata: `stego metadata read <markdown-path> --format json`
- Apply metadata: `stego metadata apply <markdown-path> --input <path|-> --format json`
- Read comments: `stego comments read <manuscript> --format json`
- Mutate comments: `stego comments add|reply|set-status|delete|clear-resolved|sync-anchors ... --format json`

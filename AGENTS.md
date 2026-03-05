# AGENTS.md

## Purpose

This repository is AI-friendly for Stego writing workflows and CLI/extension development.
Default to Stego CLI commands for Stego-managed content changes.

## Current Architecture Snapshot

- CLI runtime entrypoint: `packages/stego-cli/src/main.ts`
- CLI architecture notes: `packages/stego-cli/docs/architecture.md`
- CLI app boundary: `packages/stego-cli/src/app/*`
- CLI domain modules: `packages/stego-cli/src/modules/*`
- Shared contracts/domain primitives: `packages/shared/src/*`
- Extension source: `packages/stego-extension/src/*`

Important: `packages/stego-cli/tools/stego-cli.ts` is legacy compatibility surface, not the primary architecture.

## Canonical CLI Locations

- User-facing docs: `packages/stego-cli/README.md`
- Full command index: `stego --help`
- Version check: `stego --version`

## CLI Resolution Rules

- Prefer local CLI over global:
  - `npm exec -- stego ...`
  - `npx --no-install stego ...`
- At the start of mutation tasks, run `stego --version` and report the version used.

## Workspace Discovery Checklist

1. Confirm workspace root contains `stego.config.json`.
2. Run `stego list-projects`.
3. Use explicit `--project <id>` for project-scoped commands.

## CLI-First Policy (Required)

When asked to edit Stego project content, attempt documented CLI commands first.

Typical targets:

- manuscript files
- spine categories and entries
- frontmatter metadata
- comments
- stage/build/export workflows

Preferred commands:

- `stego new`
- `stego spine read`
- `stego spine new-category`
- `stego spine new`
- `stego metadata read`
- `stego metadata apply`
- `stego comments ...`

## Machine-Mode Output

- For automation/integrations, prefer `--format json`.
- Parse structured envelopes; avoid parsing human text output when JSON exists.

## Mutation Protocol

1. Read current state first (`metadata read`, `spine read`, `comments read`).
2. Mutate via CLI.
3. Verify after writes (`stego validate --project <id>` and relevant read commands).

## Manual Edit Fallback

Manual edits to Stego-managed content are last resort. Use only when:

1. no documented CLI command exists, or
2. CLI fails and cannot be reasonably recovered.

If manual edits are required:

1. warn that CLI was bypassed,
2. explain why, and
3. list edited files.

## Failure Contract

When CLI fails:

1. show attempted command,
2. summarize error,
3. report recovery attempt,
4. if still blocked, apply Manual Edit Fallback policy.

## Architecture Guardrails (Code Changes)

For CLI code edits:

1. Treat each `src/modules/<name>/` directory as a module boundary.
2. Import other modules via `src/modules/<name>/index.ts` only (no deep cross-module imports).
3. Keep shared primitives/contracts in `packages/shared/src/**/index.ts` and consume from there.
4. Keep process exit, stdout/stderr rendering, and top-level error mapping in app boundary (`src/app/*`), not in domain logic.

For extension code edits:

1. Keep extension UX/editor behavior in extension package.
2. Keep canonical mutation semantics in CLI/shared domain logic.
3. Reuse shared CLI contracts/domain parsers where parity is required.

## Shared Package Build Hygiene

- Do not commit generated files in `packages/shared/src`.
- Build output belongs in `packages/shared/dist`.
- Never manually edit generated outputs in `dist/` or `out/`.

## Validation Expectations

After CLI/content mutations, run relevant checks when feasible.

For architecture/code changes, prefer:

- `npm run -w packages/stego-cli check:module-apis`
- `npm run -w packages/stego-cli check:boundaries`
- `npm run -w packages/stego-cli test`
- `npm run -w packages/stego-extension test:pure` (when extension/shared touched)
- `npm --prefix packages/shared run build` (when shared touched)

## Scope Guardrails

- Do not manually edit `dist/` outputs or compiled export artifacts.
- Do not modify files outside requested scope unless explicitly asked.

## Task To Command Quick Map

- New manuscript: `stego new --project <id> [--filename <name>]`
- Read spine: `stego spine read --project <id> --format json`
- New spine category: `stego spine new-category --project <id> --key <category>`
- New spine entry: `stego spine new --project <id> --category <category> [--filename <path>]`
- Read metadata: `stego metadata read <markdown-path> --format json`
- Apply metadata: `stego metadata apply <markdown-path> --input <path|-> --format json`
- Read comments: `stego comments read <manuscript> --format json`
- Mutate comments: `stego comments add|reply|set-status|delete|clear-resolved|sync-anchors ... --format json`

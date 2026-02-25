# Commands

## CMD-INIT
label: stego init [--force]

- `stego init [--force]`
- Initialize a Stego workspace in the current directory.
- Related workflows: FLOW-INIT-WORKSPACE.
- Related concepts: CON-WORKSPACE, CON-PROJECT.
- Related integrations: INT-VSCODE.

## CMD-LIST-PROJECTS
label: stego list-projects [--root <path>]

- `stego list-projects [--root <path>]`
- List projects found in the current workspace.
- Related workflows: FLOW-INIT-WORKSPACE, FLOW-DAILY-WRITING.
- Related concepts: CON-WORKSPACE, CON-PROJECT.

## CMD-NEW-PROJECT
label: stego new-project --project <project-id> [--title <title>] [--root <path>]

- `stego new-project --project <project-id> [--title <title>] [--root <path>]`
- Scaffold a new project under `projects/`.
- Related workflows: FLOW-NEW-PROJECT.
- Related concepts: CON-PROJECT, CON-MANUSCRIPT, CON-NOTES, CON-DIST.

## CMD-VALIDATE
label: stego validate --project <project-id> [--file <project-relative-manuscript-path>] [--root <path>]

- `stego validate --project <project-id> [--file <project-relative-manuscript-path>] [--root <path>]`
- Validate project configuration, manuscript structure, metadata, and references.
- Related workflows: FLOW-DAILY-WRITING, FLOW-STAGE-PROMOTION.
- Related concepts: CON-METADATA, CON-SPINE.
- Related configuration: CFG-REQUIRED-METADATA, CFG-SPINE-CATEGORIES.

## CMD-BUILD
label: stego build --project <project-id> [--root <path>]

- `stego build --project <project-id> [--root <path>]`
- Compile manuscript files into one generated markdown output.
- Related workflows: FLOW-BUILD-EXPORT, FLOW-DAILY-WRITING.
- Related concepts: CON-MANUSCRIPT, CON-DIST, CON-COMPILE-STRUCTURE.
- Related configuration: CFG-COMPILE-STRUCTURE, CFG-COMPILE-LEVELS.

## CMD-CHECK-STAGE
label: stego check-stage --project <project-id> --stage <draft|revise|line-edit|proof|final> [--file <project-relative-manuscript-path>] [--root <path>]

- `stego check-stage --project <project-id> --stage <draft|revise|line-edit|proof|final> [--file <project-relative-manuscript-path>] [--root <path>]`
- Run stage-aware checks for a requested editorial stage.
- Related workflows: FLOW-STAGE-PROMOTION, FLOW-PROOF-RELEASE.
- Related concepts: CON-STAGE-GATE, CON-METADATA.
- Related configuration: CFG-STAGE-POLICIES, CFG-ALLOWED-STATUSES.

## CMD-EXPORT
label: stego export --project <project-id> --format <md|docx|pdf|epub> [--output <path>] [--root <path>]

- `stego export --project <project-id> --format <md|docx|pdf|epub> [--output <path>] [--root <path>]`
- Export compiled output to target formats.
- Related workflows: FLOW-BUILD-EXPORT, FLOW-PROOF-RELEASE.
- Related concepts: CON-DIST.
- Related integrations: INT-PANDOC.

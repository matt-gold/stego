# Workflows

## FLOW-INIT-WORKSPACE
label: "Install the CLI, initialize a workspace, install local dev tools, and inspect scaffolded projects."

- Install the CLI, initialize a workspace, install local dev tools, and inspect scaffolded projects.
- Related commands: CMD-INIT, CMD-LIST-PROJECTS.
- Related concepts: CON-WORKSPACE, CON-PROJECT.

## FLOW-DAILY-WRITING
label: "Open one project, write in manuscript files, validate, build, and commit progress."

- Open one project, write in manuscript files, validate, build, and commit progress.
- Related commands: CMD-VALIDATE, CMD-BUILD.
- Related concepts: CON-MANUSCRIPT, CON-METADATA, CON-DIST.
- Related integrations: INT-VSCODE.

## FLOW-NEW-PROJECT
label: "Create a new project, review generated folders, and configure project metadata rules."

- Create a new project, review generated folders, and configure project metadata rules.
- Related commands: CMD-NEW-PROJECT, CMD-VALIDATE.
- Related concepts: CON-PROJECT, CON-MANUSCRIPT, CON-SPINE.
- Related configuration: CFG-STEGO-PROJECT.

## FLOW-STAGE-PROMOTION
label: Move files through statuses and verify readiness with stage checks.

- Move files through statuses and verify readiness with stage checks.
- Related commands: CMD-CHECK-STAGE, CMD-VALIDATE.
- Related concepts: CON-STAGE-GATE, CON-METADATA.
- Related configuration: CFG-STAGE-POLICIES, CFG-ALLOWED-STATUSES.

## FLOW-BUILD-EXPORT
label: Build a compiled markdown manuscript and export distribution formats.

- Build a compiled markdown manuscript and export distribution formats.
- Related commands: CMD-BUILD, CMD-EXPORT.
- Related concepts: CON-DIST, CON-COMPILE-STRUCTURE.
- Related integrations: INT-PANDOC.

## FLOW-PROOF-RELEASE
label: "Run strict checks, build outputs, export artifacts, and archive release files."

- Run strict checks, build outputs, export artifacts, and archive release files.
- Related commands: CMD-CHECK-STAGE, CMD-BUILD, CMD-EXPORT.
- Related concepts: CON-STAGE-GATE, CON-DIST.
- Related integrations: INT-MARKDOWNLINT, INT-CSPELL.

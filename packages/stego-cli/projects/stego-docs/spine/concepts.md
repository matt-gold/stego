# Concepts

## CON-WORKSPACE
label: A Stego workspace is the root directory containing `stego.config.json` and `projects/`.

- A Stego workspace is the root directory containing `stego.config.json` and `projects/`.
- Related commands: CMD-INIT, CMD-LIST-PROJECTS.
- Related workflows: FLOW-INIT-WORKSPACE.

## CON-PROJECT
label: A project is one writing unit inside `projects/<project-id>/` with its own `stego-project.json` and manuscript files in `/projects/<project-id>/manuscripts`.

- A project is one writing unit inside `projects/<project-id>/` with its own `stego-project.json` and manuscript files in `/projects/<project-id>/manuscripts`.
- Related commands: CMD-NEW-PROJECT, CMD-VALIDATE, CMD-BUILD.
- Related workflows: FLOW-NEW-PROJECT, FLOW-DAILY-WRITING.

## CON-MANUSCRIPT
label: `manuscript/` contains canonical source writing files ordered by filename prefix.

- `manuscript/` contains canonical source writing files ordered by filename prefix.
- Related commands: CMD-VALIDATE, CMD-BUILD.
- Related configuration: CFG-REQUIRED-METADATA, CFG-COMPILE-STRUCTURE.

## CON-SPINE
label: `spine/` stores canonical entities used for continuity and navigation.

- `spine/` stores canonical entities used for continuity and navigation.
- Related configuration: CFG-SPINE-CATEGORIES.
- Related integrations: INT-STEGO-EXTENSION.

## CON-NOTES
label: `notes/` contains supporting material that is not part of compiled manuscript output.

- `notes/` contains supporting material that is not part of compiled manuscript output.
- Related commands: CMD-NEW-PROJECT.
- Related workflows: FLOW-DAILY-WRITING.

## CON-DIST
label: `dist/` is generated output only and can be rebuilt from sources.

- `dist/` is generated output only and can be rebuilt from sources.
- Related commands: CMD-BUILD, CMD-EXPORT.
- Related workflows: FLOW-BUILD-EXPORT, FLOW-PROOF-RELEASE.

## CON-METADATA
label: "Frontmatter metadata drives validation, stage checks, grouping, and continuity references."

- Frontmatter metadata drives validation, stage checks, grouping, and continuity references.
- Related commands: CMD-VALIDATE, CMD-CHECK-STAGE.
- Related configuration: CFG-REQUIRED-METADATA, CFG-ALLOWED-STATUSES.

## CON-STAGE-GATE
label: Stage gates apply stricter checks as work moves from drafting to release.

- Stage gates apply stricter checks as work moves from drafting to release.
- Related commands: CMD-CHECK-STAGE.
- Related workflows: FLOW-STAGE-PROMOTION, FLOW-PROOF-RELEASE.
- Related configuration: CFG-STAGE-POLICIES.

## CON-COMPILE-STRUCTURE
label: Compile structure groups ordered files into larger sections during build.

- Compile structure groups ordered files into larger sections during build.
- Related commands: CMD-BUILD.
- Related configuration: CFG-COMPILE-STRUCTURE, CFG-COMPILE-LEVELS.

## CON-SPINE-CATEGORY
label: "A spine category defines a metadata key, ID prefix, and canonical notes file."

- A spine category defines a metadata key, ID prefix, and canonical notes file.
- Related concepts: CON-SPINE, CON-METADATA.
- Related configuration: CFG-SPINE-CATEGORIES.

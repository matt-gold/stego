# Configuration

## CFG-STEGO-CONFIG
label: Workspace-level configuration in `stego.config.json` defines shared directories and stage policies.

- Workspace-level configuration in `stego.config.json` defines shared directories and stage policies.
- Related concepts: CON-WORKSPACE.
- Related commands: CMD-LIST-PROJECTS, CMD-CHECK-STAGE.

## CFG-STEGO-PROJECT
label: "Project-level configuration in `stego-project.json` defines metadata rules, grouping, and spine categories."

- Project-level configuration in `stego-project.json` defines metadata rules, grouping, and spine categories.
- Related concepts: CON-PROJECT, CON-METADATA, CON-SPINE.
- Related commands: CMD-VALIDATE, CMD-BUILD.

## CFG-REQUIRED-METADATA
label: Advisory list of frontmatter keys expected in manuscript files.

- Advisory list of frontmatter keys expected in manuscript files.
- Related concepts: CON-METADATA.
- Related commands: CMD-VALIDATE.

## CFG-COMPILE-STRUCTURE
label: Build grouping configuration that defines structural levels and heading behavior.

- Build grouping configuration that defines structural levels and heading behavior.
- Related concepts: CON-COMPILE-STRUCTURE.
- Related commands: CMD-BUILD.

## CFG-COMPILE-LEVELS
label: "The ordered `levels` array inside compile structure, with keys, labels, title keys, and page break options."

- The ordered `levels` array inside compile structure, with keys, labels, title keys, and page break options.
- Related configuration: CFG-COMPILE-STRUCTURE.
- Related concepts: CON-COMPILE-STRUCTURE.

## CFG-SPINE-CATEGORIES
label: Per-project category definitions mapping metadata keys to ID prefixes and spine files.

- Per-project category definitions mapping metadata keys to ID prefixes and spine files.
- Related concepts: CON-SPINE, CON-SPINE-CATEGORY.
- Related commands: CMD-VALIDATE.

## CFG-STAGE-POLICIES
label: Stage policy settings determine which checks are enforced at each stage.

- Stage policy settings determine which checks are enforced at each stage.
- Related concepts: CON-STAGE-GATE.
- Related commands: CMD-CHECK-STAGE.

## CFG-ALLOWED-STATUSES
label: Workspace-level list of allowed manuscript statuses.

- Workspace-level list of allowed manuscript statuses.
- Related concepts: CON-METADATA, CON-STAGE-GATE.
- Related commands: CMD-VALIDATE, CMD-CHECK-STAGE.

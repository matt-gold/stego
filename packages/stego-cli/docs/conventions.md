# Creative Writing Conventions

## 1) Canonical ordering and metadata

Each manuscript file lives in:

`/Users/mattgold/Code/writing/projects/<project-id>/manuscript/`

Naming convention (order-oriented, not chapter-oriented):

- `100-opening-image.md`
- `200-market-interruption.md`

Default metadata preference (global):

```yaml
---
status: draft
---
```

Per-project metadata preferences can be set in `stego-project.json`:

```json
{
  "requiredMetadata": ["status", "chapter", "pov", "timeline"]
}
```

These keys are advisory and reported as warnings when missing; they do not block validate/build/export.
Manuscript files can omit metadata blocks.

Optional metadata:

- `title`: optional override for display heading; default is derived from filename
- grouping keys/titles defined by your project's `compileStructure.levels` (for example `part`, `part_title`, `chapter`, `chapter_title`)
- category arrays defined by your project's `spineCategories` config (example: `cast`, `places`, `incidents`, `ordinances`)

Rules:

- Filename must start with a numeric prefix followed by `-` or `_` (example: `100-scene.md`).
- Use three-digit prefixes and leave gaps (`100`, `200`, `300`) to make reordering easy.
- `status` must be one of: `draft`, `revise`, `line-edit`, `proof`, `final`.
- Build sorts by filename prefix order.
- Group headings/page breaks are driven by `compileStructure.levels` key changes across ordered files.
- Canon references belong in metadata arrays defined by project configuration.
- Do not place canon IDs directly in prose.

Compile structure rules:

- `compileStructure.levels` is optional; when omitted, build emits entry sections only (no structural group headings).
- Each level defines: `key`, `label`, optional `titleKey`, optional `injectHeading`, optional `headingTemplate`, optional `pageBreak` (`none` or `between-groups`).
- Missing group key/title values inherit from the previous manuscript file, so only boundary files need explicit group metadata.

## 2) Project-defined spine categories

Spine categories are configured per project in `stego-project.json`.

Example:

```json
{
  "id": "my-project",
  "title": "My Project",
  "spineCategories": [
    { "key": "cast", "prefix": "CHAR", "notesFile": "characters.md" },
    { "key": "places", "prefix": "LOC", "notesFile": "locations.md" },
    { "key": "incidents", "prefix": "EVENT", "notesFile": "timeline.md" },
    { "key": "ordinances", "prefix": "STATUTE", "notesFile": "ordinances.md" }
  ]
}
```

Category rules:

- `key`: lowercase metadata field name used in manuscript files
- `prefix`: uppercase ID prefix used in references (example: `STATUTE`)
- `notesFile`: markdown filename resolved in `spine/` containing canonical entries
- `spineCategories` may be omitted or empty for projects that do not need continuity entity tracking

## 3) Spine governance

Every project keeps canonical story facts in:

`/Users/mattgold/Code/writing/projects/<project-id>/spine/`

Required spine files are determined by `spineCategories[*].notesFile`.

Governance rule:

- If manuscript facts change, update the relevant spine file in the same branch before merge.
- Canon IDs are referenced from manuscript metadata, not inline prose.

## 4) Editorial states

- `draft`: drafting only, minimal enforcement.
- `revise`: structural edits and continuity corrections.
- `line-edit`: sentence-level edits, grammar and spelling focus.
- `proof`: publication polish with strict link/lint/spell checks.
- `final`: release candidate; all manuscript files should be `final`.

## 5) Quality gates

Blocking checks:

- malformed or missing metadata
- invalid `compileStructure` schema in `stego-project.json`
- invalid required metadata
- duplicate filename numeric prefixes
- invalid category reference metadata (bad format or wrong field type)
- inline canon IDs in prose (metadata-only policy)
- broken local links/images (strict in `proof` and `final`)
- stage mismatch (file status below requested stage)

Advisory checks:

- heading-level jumps
- long paragraphs/sentences
- unknown spine IDs referenced in metadata
- optional external lint/spell tool feedback

## 6) Build contract

Build command compiles all manuscript files for one project into exactly one manuscript Markdown file.

Contract:

- Input: `manuscript/*.md`
- Pre-step: metadata and structure validation
- Ordering: filename numeric prefix
- Structural headers/page breaks: inserted when configured `compileStructure.levels` keys change
- Output: `dist/<project-id>.md`
- Output includes generated title header, table of contents, structural sections (if configured), and per-file subsections
- Generated files in `dist/` are never hand-edited

## 7) Release outputs

Current targets:

- required: compiled `.md`
- optional: `.docx` and `.pdf` via `pandoc`

Design principle:

- export uses a pluggable abstraction so future formats can be added without changing manuscript structure.

## 8) Git conventions

Branching:

- Work on short-lived branches from `main`.

Commit message format:

- `manuscript: revise file 07 pacing`
- `notes: update CHAR-MIRA arc`
- `build: tighten metadata validation`

Tag milestones:

- `<project-id>/v0.1-draft`
- `<project-id>/v0.2-revise`
- `<project-id>/v1.0-final`

Policy:

- no force-push to `main`
- merge only when stage checks pass for the intended stage
- manuscript fact changes require matching spine updates

## 9) Backup and resilience

Use three layers:

- local git history
- remote private origin (GitHub/GitLab)
- machine backup (Time Machine or equivalent)

Recovery principle:

- source of truth is `manuscript/` and `notes/`
- `dist/` is reproducible output and may be regenerated any time

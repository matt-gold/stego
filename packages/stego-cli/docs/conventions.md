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

Per-project metadata preferences can be set in `project.json`:

```json
{
  "requiredMetadata": ["status", "chapter", "pov", "timeline"]
}
```

These keys are advisory and reported as warnings when missing; they do not block validate/build/export.
Manuscript files can omit metadata blocks.

Optional metadata:

- `title`: optional override for display heading; default is derived from filename
- `chapter`: optional numeric chapter grouping key
- `chapter_title`: recommended on the first file in a chapter when using chapter grouping
- category arrays defined by your project's `bibleCategories` config (example: `cast`, `places`, `incidents`, `ordinances`)

Rules:

- Filename must start with a numeric prefix followed by `-` or `_` (example: `100-scene.md`).
- Use three-digit prefixes and leave gaps (`100`, `200`, `300`) to make reordering easy.
- If present, `chapter` must be a positive integer.
- `status` must be one of: `draft`, `revise`, `line-edit`, `proof`, `final`.
- Build sorts by filename prefix order.
- Chapter breaks are inferred when `chapter` changes between ordered files.
- Canon references belong in metadata arrays defined by project configuration.
- Do not place canon IDs directly in prose.

## 2) Project-defined bible categories

Bible categories are configured per project in `project.json`.

Example:

```json
{
  "id": "my-project",
  "title": "My Project",
  "bibleCategories": [
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
- `notesFile`: markdown filename resolved in `story-bible/` containing canonical entries
- `bibleCategories` may be omitted or empty for projects that do not need continuity entity tracking

## 3) Story bible governance

Every project keeps canonical story facts in:

`/Users/mattgold/Code/writing/projects/<project-id>/story-bible/`

Required bible files are determined by `bibleCategories[*].notesFile`.

Governance rule:

- If manuscript facts change, update the relevant bible file in the same branch before merge.
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
- invalid required metadata
- duplicate filename numeric prefixes
- invalid chapter numbering or chapter sequence regression (when chapter metadata is used)
- invalid category reference metadata (bad format or wrong field type)
- inline canon IDs in prose (metadata-only policy)
- broken local links/images (strict in `proof` and `final`)
- stage mismatch (file status below requested stage)

Advisory checks:

- heading-level jumps
- long paragraphs/sentences
- unknown story bible IDs referenced in metadata
- optional external lint/spell tool feedback

## 6) Build contract

Build command compiles all manuscript files for one project into exactly one manuscript Markdown file.

Contract:

- Input: `manuscript/*.md`
- Pre-step: metadata and structure validation
- Ordering: filename numeric prefix
- Chapter headers: inserted when ordered files change `chapter`
- Output: `dist/<project-id>.md`
- Output includes generated title header, table of contents, chapter sections, and per-file subsections
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
- manuscript fact changes require matching story bible updates

## 9) Backup and resilience

Use three layers:

- local git history
- remote private origin (GitHub/GitLab)
- machine backup (Time Machine or equivalent)

Recovery principle:

- source of truth is `manuscript/` and `notes/`
- `dist/` is reproducible output and may be regenerated any time

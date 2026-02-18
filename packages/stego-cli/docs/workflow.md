# Workflow Plan

## Daily writing loop

1. Pick project and target manuscript file.
2. Open the project folder (`projects/<project-id>`).
3. Write in VS Code in `manuscript/*.md`.
4. Set file metadata preferred by that project's `project.json` (`requiredMetadata`).
5. Run validate/build locally.
6. Run stage check for current milestone.
7. Commit and push.

## Commands

From `/Users/mattgold/Code/writing`:

```bash
npm run list-projects
npm run new-project -- --project <project-id> --title "<title>"
npm run sync-settings -- --project <project-id>
npm run validate -- --project <project-id>
npm run build -- --project <project-id>
npm run check-stage -- --project <project-id> --stage <draft|revise|line-edit|proof|final>
npm run export -- --project <project-id> --format <md|docx|pdf>
```

From a project directory (`/Users/mattgold/Code/writing/projects/<project-id>`):

```bash
npm run validate
npm run build
npm run sync-settings
npm run check-stage -- --stage revise
npm run export -- --format md
```

## Chaptering model (file-first)

- Keep one file per writing unit (scene, beat, section, or chapter fragment).
- Use filename prefixes (`100-...`, `200-...`, `300-...`) for sequencing.
- Use `chapter` for chapter grouping when your project requires it.
- Build inserts a chapter heading when grouped by `chapter`; without chapter metadata, output is a single manuscript section.
- Optional `chapter_title` can be set on the first file in a chapter.

## Bible category model (project-defined)

- Configure `bibleCategories` in each project's `project.json`.
- Choose category names and ID prefixes that match your domain.
- Keep IDs out of prose; use metadata arrays for references.
- Keep each category's canonical entries in its configured `notesFile`.
- Omit `bibleCategories` if a project does not need continuity entity tracking.

## Stage progression model

- Start with `draft` while creating new text.
- Move to `revise` when story structure is stable.
- Move to `line-edit` once structure is settled.
- Move to `proof` before sharing with readers/editors.
- Move to `final` when preparing release snapshots.

## Suggested milestones

1. `v0.1-draft`: complete rough draft.
2. `v0.2-revise`: major structural edits complete.
3. `v0.3-line-edit`: language tightening complete.
4. `v0.4-proof`: strict checks pass.
5. `v1.0-final`: release candidate.

## AI integration guardrails

- AI suggestions should be review-first (diff/patch/report), not silent overwrite.
- Keep human approval as required step before manuscript changes.
- Treat AI outputs as advisory during `draft` and `revise`.
- Allow stricter AI-assisted checks in `line-edit` and `proof` if useful.

## Backup routine

- Push to remote at end of each writing session.
- Maintain machine-level backup daily.
- Create milestone tags before major rewrites.

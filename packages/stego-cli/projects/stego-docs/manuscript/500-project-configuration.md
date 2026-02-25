---
status: draft
chapter: 5
chapter_title: Project Configuration
concepts:
  - CON-WORKSPACE
  - CON-PROJECT
  - CON-METADATA
  - CON-COMPILE-STRUCTURE
  - CON-SPINE
  - CON-SPINE-CATEGORY
commands:
  - CMD-VALIDATE
  - CMD-BUILD
workflows:
  - FLOW-NEW-PROJECT
  - FLOW-DAILY-WRITING
configuration:
  - CFG-STEGO-CONFIG
  - CFG-STEGO-PROJECT
  - CFG-REQUIRED-METADATA
  - CFG-COMPILE-STRUCTURE
  - CFG-COMPILE-LEVELS
  - CFG-SPINE-CATEGORIES
  - CFG-STAGE-POLICIES
  - CFG-ALLOWED-STATUSES
---

# Project Configuration

Stego uses two configuration layers:

- `stego.config.json` at the workspace root for shared directories and stage policies
- `stego-project.json` inside each project for project-specific rules

## Metadata requirements

Projects can declare advisory metadata keys in `requiredMetadata`.

Stego reports missing keys as warnings so teams can standardize frontmatter without blocking early drafting.

Common keys include `status`, grouping fields such as `chapter`, and project-specific metadata such as point of view or timeline.

## Compile structure

Projects can define `compileStructure.levels` to group manuscript files during build.

This is how Stego inserts structural headings and optional page breaks while still letting authors keep source files small and file-first.

Grouping metadata can be repeated at boundaries only, because Stego inherits missing group values and titles from earlier files in order.

## Spine categories

Projects that use continuity tracking or concept browsing define `spineCategories` in `stego-project.json`.

Each category maps a metadata key to an ID prefix and a canonical notes file in `spine/`.

This project uses Spine categories to model documentation entities such as commands, concepts, workflows, configuration topics, and integrations.

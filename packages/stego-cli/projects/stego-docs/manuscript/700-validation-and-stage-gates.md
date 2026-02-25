---
status: draft
chapter: 7
chapter_title: Validation and Stage Gates
concepts:
  - CON-METADATA
  - CON-STAGE-GATE
  - CON-SPINE
commands:
  - CMD-VALIDATE
  - CMD-CHECK-STAGE
workflows:
  - FLOW-STAGE-PROMOTION
  - FLOW-PROOF-RELEASE
configuration:
  - CFG-REQUIRED-METADATA
  - CFG-STAGE-POLICIES
  - CFG-ALLOWED-STATUSES
integrations:
  - INT-MARKDOWNLINT
  - INT-CSPELL
---

# Validation and Stage Gates

Stego separates baseline validation from stage-aware enforcement.

## `validate`

Use `validate` for fast project integrity checks while drafting or restructuring.

It checks configuration shape, manuscript ordering, metadata parsing, and continuity reference structure.

## `check-stage`

Use `check-stage` to ask whether a file or project is ready for a specific editorial stage.

Stages typically progress from draft through revise, line edit, proof, and final. Higher stages enable stricter policies.

## Blocking vs advisory checks

Stego reports a mix of errors and warnings:

- errors block the command result
- warnings highlight issues worth fixing but do not stop work

This lets teams keep early drafting fast while tightening quality standards later in the workflow.

## Proof and final expectations

Proof and final stages commonly enable stricter checks such as markdown linting, spelling checks, local link validation, and resolved comment requirements.

Those rules are configured in stage policies at the workspace level.

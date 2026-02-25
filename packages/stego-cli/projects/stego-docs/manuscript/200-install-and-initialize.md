---
status: draft
chapter: 2
chapter_title: Install and Initialize
concepts:
  - CON-WORKSPACE
  - CON-PROJECT
commands:
  - CMD-INIT
  - CMD-LIST-PROJECTS
workflows:
  - FLOW-INIT-WORKSPACE
integrations:
  - INT-VSCODE
  - INT-STEGO-EXTENSION
---

# Install and Initialize

## Install the CLI

Install the CLI globally so the `stego` command is available in your shell.

```bash
npm install -g stego-cli
```

## Create a workspace

Start in an empty directory and initialize a Stego workspace.

```bash
mkdir my-stego-workspace
cd my-stego-workspace
stego init
```

The command scaffolds a workspace with a root config, root scripts, VS Code tasks, and two example projects: `stego-docs` and `fiction-example`.

If you need to initialize into a non-empty directory, run `stego init --force`.

## Install workspace tools

After scaffolding, install the workspace dependencies used by local scripts and quality checks.

```bash
npm install
```

## Open a project in the official UI

After scaffolding, open one project directory in VS Code (start with `projects/stego-docs`).

The Stego VS Code extension is the official UI for Stego projects. It provides project-aware controls, checks, and Spine Browser navigation while you edit.

The scaffolded project folders include extension recommendations to help you install the Stego extension (and the Saurus companion extension) quickly.

## Confirm the workspace is working

Run a few commands from the workspace root.

```bash
stego list-projects
stego validate --project stego-docs
stego build --project stego-docs
```

The full documentation for the workspace lives inside the `stego-docs` project you just scaffolded.

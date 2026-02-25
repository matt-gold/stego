# Stego Docs

This is the canonical Stego documentation project.

It is a real Stego project that demonstrates:

- docs-first usage of the workspace model
- Spine-driven navigation for commands, concepts, workflows, configuration, and integrations
- build/export behavior for documentation teams

## Read the docs

Open `manuscript/` in order, or build the compiled manual:

```bash
stego build --project stego-docs
```

If you are working in this source repo (not a scaffolded workspace), the equivalent is:

```bash
npm run build -- --project stego-docs
```

## Recommended VS Code workflow

Open `projects/stego-docs` directly in VS Code while editing this project so project recommendations and the Spine Browser stay focused on the documentation graph.

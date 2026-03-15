# Stego Docs

This is the canonical Stego documentation project.

It demonstrates:

- the leaf model (`content/` contains authored leaves)
- branch notes with `_branch.md`
- manuscript build/export through TSX templates
- `ctx.content` / `ctx.allLeaves` / `ctx.allBranches` in real templates
- internal links with `Stego.Link`
- one example convention that renders reference leaves into backmatter appendices

## Read the docs

Open `content/` in order, or build the compiled manual:

```bash
stego build --project stego-docs
```

To inspect the template render plan directly:

```bash
stego template build --project stego-docs
```

If you are working in this source repo, the equivalent is:

```bash
npm run build -- --project stego-docs
```

## Recommended VS Code workflow

Open `projects/stego-docs` directly in VS Code so project recommendations, template IntelliSense, and the explorer stay focused on this documentation graph.

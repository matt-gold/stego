---
label: Template collections expose ordered leaves through helpers such as groupBy(...) and splitBy(...).
id: CFG-TEMPLATE-COLLECTIONS
kind: reference
---

# Template helpers expose ordered leaves through `Stego.groupBy(...)` and `Stego.splitBy(...)`.

- `ctx.content` is the root content tree.
- `ctx.content.leaves` contains only the direct leaves under `content/`.
- `ctx.content.branches` contains the top-level branches, and nested branches continue through `branch.branches`.
- `ctx.allLeaves` is the full ordered array of leaves.
- `ctx.allBranches` exposes the flat list of discovered branches under `content/`.
- `branch.id` is the structural branch id and `branch.parentId` links the branch tree.
- `branch.leaves` contains the direct leaves for that branch.
- `leaf.branchId` points back to the containing branch.
- Use `Stego.splitBy(...)` when manuscript structure should follow ordered boundary changes.
- Use `Stego.groupBy(...)` when you want unordered summary buckets or appendix sections.
- Related configuration: CFG-TEMPLATES.
- Related concepts: CON-TEMPLATE-ENGINE.

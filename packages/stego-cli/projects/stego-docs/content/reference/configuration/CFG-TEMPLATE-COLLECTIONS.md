---
label: Template collections expose ordered leaves through helpers such as groupBy(...) and splitBy(...).
id: CFG-TEMPLATE-COLLECTIONS
kind: reference
---

# Template helpers expose ordered leaves through `Stego.groupBy(...)` and `Stego.splitBy(...)`.

- `ctx.content` is the full ordered array of leaves.
- `ctx.branches` exposes directory branches discovered under `content/`.
- Use `Stego.splitBy(...)` when manuscript structure should follow ordered boundary changes.
- Use `Stego.groupBy(...)` when you want unordered summary buckets or appendix sections.
- Related configuration: CFG-TEMPLATES.
- Related concepts: CON-TEMPLATE-ENGINE.

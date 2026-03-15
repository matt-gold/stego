---
id: CON-SPINE
kind: reference
label: Reference material is modeled as leaves, typically under content/reference/.
---

# Reference material is modeled as leaves, typically under content/reference/.

- Stego no longer has a first-class spine model.
- Reference topics, glossaries, sources, and entities are just leaves with ids and metadata.
- A common convention is storing them under `content/reference/` and tagging them with `kind: reference`.
- Related configuration: CFG-SPINE-CATEGORIES.
- Related integrations: INT-STEGO-EXTENSION.

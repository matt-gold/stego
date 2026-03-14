---
"@stego-labs/shared": patch
"@stego-labs/engine": patch
"@stego-labs/cli": patch
---

Add a `Stego.KeepTogether` template primitive with real DOCX, PDF, and HTML/EPUB support, add DOCX parity for existing block layout props (`spaceBefore`, `spaceAfter`, `insetLeft`, `insetRight`, `firstLineIndent`, and `align`) plus aligned block images, and fix template authoring types so TSX templates typecheck correctly.

---
"stego-cli": patch
---

Fix `stego comments add` to write canonical comment delimiters (`<!-- comment: CMT-#### -->`) and prevent duplicate comment IDs by deriving the next ID from existing comments in the appendix (including legacy heading compatibility). Also update CLI comment parsing to accept canonical comment delimiters while remaining backward-compatible with legacy `### CMT-####` headings.

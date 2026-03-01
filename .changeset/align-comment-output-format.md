---
"stego-cli": patch
---

Align `stego comments add` output with extension comment formatting: human-readable header timestamp with em-dash author separator, nested quoted selection excerpt, and extension-compatible `meta64` fields (`created_at`, `timezone`, `timezone_offset_minutes`, paragraph and excerpt coordinates). Also expand CLI comment parsing compatibility for extension metadata keys and em-dash-style thread headers.

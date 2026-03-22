# Architecture

`@stego-labs/engine` is organized as small modules with explicit boundaries.

- `ir/`: canonical document node types and constructors
- `collections/`: generic immutable collection helpers used by template context
- `template/public/`: author-facing API (`defineTemplate`, `Stego`, context/types)
- `template/internal/`: JSX runtime, child normalization, and template loading
- `compile/public/`: project compilation entrypoints
- `compile/internal/`: filesystem loading and context assembly
- `render/public/`: backend-document entrypoints
- `render/internal/`: normalization and backend lowering

The template layer targets Stego IR, not HTML or the DOM. The render layer lowers IR into a Pandoc-oriented backend document so page furniture and image/layout metadata can be expressed without leaking backend-specific syntax into the author-facing API.

`internal/` code is private to its top-level module and must not be imported from outside that module.

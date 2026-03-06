# stego-extension Architecture

## Design Goals

- Preserve CLI-first behavior: extension UX delegates project mutations to `stego-cli`.
- Keep sidebar code modular by tab (`document`, `spine`, `overview`) and by rendering/orchestration seams.
- Keep pure domain helpers testable without VS Code runtime dependencies.

## Source Layout

```text
src/
  extension.ts
  features/
    commands/
    comments/
    diagnostics/
    identifiers/
    indexing/
    metadata/
    navigation/
    project/
    sidebar/
      index.ts
      core/
        sidebarProvider.ts
        sidebarProvider.types.ts
      tabs/
        document/
          sidebarToc.ts
          sidebarStateBuilder.ts
        spine/
          sidebarExplorer.ts
          sidebarRoutes.ts
          spinePins.ts
        overview/
          overviewMetrics.ts
      webview/
        renderSidebarHtml.ts
        renderMarkdownForExplorer.ts
        renderUtils.ts
        sidebarAssetUris.ts
  shared/
```

## Module Responsibilities

- `sidebar/core`: state orchestration, refresh scheduling, message handling, command dispatch.
- `sidebar/tabs/document`: document-centric projections (TOC, metadata references, contextual backlinks).
- `sidebar/tabs/spine`: spine explorer routing, category/entry projections, pin-state transitions.
- `sidebar/tabs/overview`: manuscript-level metrics and ordering logic.
- `sidebar/webview`: presentational HTML/markdown rendering and asset URI wiring.

Non-sidebar feature modules also use explicit public entrypoints:

- `features/commands/index.ts`
- `features/comments/index.ts`
- `features/diagnostics/index.ts`
- `features/identifiers/index.ts`
- `features/indexing/index.ts`
- `features/metadata/index.ts`
- `features/navigation/index.ts`
- `features/project/index.ts`

## Dependency Direction

- `core` can depend on `tabs/*` and `webview`.
- `tabs/*` should not depend on `core`.
- `webview` is presentation-only and should not execute side effects.
- `features/*` modules can depend on `shared/*` primitives.
- Cross-feature imports should target module entrypoints (`../module`) rather than deep file paths.

## Contribution Guidance

1. Add behavior to the nearest tab module first; only add to `core` when orchestration/state coordination is required.
2. Keep pure logic in tab/helpers and cover it with `src/test/pure/*`.
3. Keep CLI invocation and mutation semantics in workflow/CLI-client layers rather than UI render code.

# stego-extension Architecture

## Design Goals

- Preserve CLI-first behavior: extension UX delegates project mutations to `@stego-labs/cli`.
- Keep sidebar code modular by tab (`document`, `explore`, `overview`) and by rendering/orchestration seams.
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
        runtime/
          sidebarRuntime.ts
          events.ts
          bus.ts
          sessionState.ts
          sessionReducer.ts
          actionHandlers/
            uiHandlers.ts
            navigationHandlers.ts
            metadataHandlers.ts
            imagesHandlers.ts
            exploreHandlers.ts
            commentsHandlers.ts
            workflowHandlers.ts
            overviewHandlers.ts
          effects/
            types.ts
            runner.ts
          projector/
            sidebarStateProjector.ts
      protocol/
        index.ts
        messages.ts
        guards.ts
        state.ts
      tabs/
        document/
          sidebarToc.ts
          sidebarStateBuilder.ts
        explore/
          sidebarExplorer.ts
          sidebarRoutes.ts
          explorerPins.ts
        overview/
          overviewMetrics.ts
      webview/
        shellHtml.ts
        stateAdapter.ts
        renderMarkdownForExplorer.ts
        renderUtils.ts
        assetUris.ts
  shared/
webview/
  sidebar/
    src/
      actions/
      app/
      bridge/
      components/
      modules/
        document/
        explore/
        overview/
      styles/
      main.tsx
```

## Module Responsibilities

- `sidebar/core/sidebarProvider.ts`: thin adapter between VS Code `WebviewViewProvider` and runtime.
- `sidebar/core/runtime`: runtime orchestration, event bus, domain action handlers, effect runner, and projection.
- `sidebar/protocol`: typed host/webview message contracts + runtime guards.
- `sidebar/tabs/document`: document-centric projections (TOC, metadata references, contextual backlinks).
- `sidebar/tabs/explore`: explorer routing, reference-group/leaf projections, and pin-state transitions.
- `sidebar/tabs/overview`: manuscript-level metrics and ordering logic.
- `sidebar/webview`: host-side webview shell + asset resolution + state adaptation.
- `webview/sidebar`: SolidJS webview SPA (rendering, local UI effects, typed action creators/dispatch).

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

- `core/runtime` can depend on `tabs/*` and `webview`.
- `tabs/*` should not depend on `core`.
- `webview/sidebar` should not call VS Code APIs directly; route all mutations through typed action creators and message dispatch.
- `features/*` modules can depend on `shared/*` primitives.
- Cross-feature imports should target module entrypoints (`../module`) rather than deep file paths.

## Contribution Guidance

1. Add behavior to the nearest domain action handler first; only add to runtime orchestration when coordination/state projection is required.
2. Keep pure logic in tab/helpers and cover it with `src/test/pure/*`.
3. Keep CLI invocation and mutation semantics in workflow/CLI-client layers and runtime effects, not webview UI render code.
4. For sidebar UI changes, prefer edits in `webview/sidebar/src/modules/*` and keep host-side state adaptation in `src/features/sidebar/webview/stateAdapter.ts`.

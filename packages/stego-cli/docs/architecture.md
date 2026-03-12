# Stego CLI Architecture

`stego-cli` now uses a domain-first module layout under `src/modules`.

## High-level layout

- `src/main.ts`: process entrypoint
- `src/app`: app boundary (registry, context, error/output)
- `src/platform`: fs/time/temp adapters
- `src/modules`: domain modules with explicit `index.ts` APIs
- `@stego/shared`: shared contracts and domain primitives published as a first-class package boundary

## Module API contract

Each module exports a facade from `index.ts` that exposes `registerCommands(registry)`.

External callers should import module APIs from `src/modules/<module>/index.ts` only.

## Command registration

Commands are registered through `src/app/command-registry.ts`.

## Boundary checks

- `npm run -w packages/stego-cli check:module-apis`
- `npm run -w packages/stego-cli check:boundaries`

These checks enforce module API shape and disallow deep cross-module imports.

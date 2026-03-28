import test from "node:test";
import assert from "node:assert/strict";
import { CliError } from "@stego-labs/shared/contracts/cli";
import { getPresentationExportAdapter } from "../../src/modules/export/application/get-presentation-export-adapter.ts";
import { prepareRenderedExport } from "../../src/modules/export/application/prepare-rendered-export.ts";

function createBackendDocument(overrides = {}) {
  return {
    backend: "pandoc-presentation",
    source: {
      inputFormat: "markdown-implicit_figures",
      markdown: "# Demo",
      resourcePaths: ["/tmp/project", "/tmp/project/assets"],
      requiredFilters: ["image-layout", "block-layout"],
      ...(overrides.source || {}),
    },
    presentation: {
      page: {
        geometry: [],
      },
      blockMarkers: [],
      inlineStyles: [],
      features: {
        usesBlockFontFamily: false,
        usesBlockLineSpacing: false,
        usesUnderline: false,
        usesTextColor: false,
        requiresNamedFontEngine: false,
      },
      ...(overrides.presentation || {}),
    },
    ...overrides,
  };
}

function createProject() {
  return {
    id: "demo",
    root: "/tmp/project",
    contentDir: "/tmp/project/content",
    notesDir: "/tmp/project/notes",
    templatesDir: "/tmp/project/templates",
    distDir: "/tmp/project/dist",
    meta: {},
    workspace: {
      repoRoot: "/tmp",
      workspaceRoot: "/tmp",
      configPath: "/tmp/stego.config.json",
      config: { projects: [] },
    },
  };
}

test("presentation adapter registry resolves the pandoc adapter by exact backend id", () => {
  const adapter = getPresentationExportAdapter("pandoc-presentation");
  assert.equal(adapter.backend, "pandoc-presentation");
});

test("presentation adapter registry throws clearly for unknown backend ids", () => {
  assert.throws(
    () => getPresentationExportAdapter("unknown-backend"),
    (error) => error instanceof CliError
      && error.code === "INTERNAL_ERROR"
      && /No presentation export adapter is registered for backend 'unknown-backend'/.test(error.message),
  );
});

test("prepareRenderedExport augments adapter resource paths for presentation targets", () => {
  const prepared = prepareRenderedExport({
    format: "docx",
    backendDocument: createBackendDocument(),
    project: createProject(),
    markdownPath: "/tmp/project/dist/demo.template.md",
  });

  assert.deepEqual(prepared.resourcePaths, [
    "/tmp/project",
    "/tmp/project/assets",
    "/tmp/project/content",
    "/tmp/project/dist",
  ]);
  assert.equal(prepared.inputFormat, "markdown-implicit_figures");
  assert.deepEqual(prepared.requiredFilters, ["image-layout", "block-layout"]);
});

test("prepareRenderedExport rejects markdown lane at runtime", () => {
  assert.throws(
    () => prepareRenderedExport({
      format: "md",
      backendDocument: createBackendDocument(),
      project: createProject(),
      markdownPath: "/tmp/project/dist/demo.template.md",
    }),
    (error) => error instanceof CliError
      && error.code === "INTERNAL_ERROR"
      && /Markdown export does not use presentation backend preparation/.test(error.message),
  );
});

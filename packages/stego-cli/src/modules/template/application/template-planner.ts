import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import {
  buildTemplateContext,
  evaluateTemplate,
  loadTemplateFromFile,
  renderDocument,
  TemplateContractError,
  type RenderDocumentResult,
  type StegoTemplate,
  type TemplateContext
} from "@stego-labs/engine";
import { CliError } from "@stego-labs/shared/contracts/cli";
import {
  isExportTarget,
  isPresentationTarget,
  type ExportTarget,
  type PresentationTarget
} from "@stego-labs/shared/domain/templates";
import { runExport } from "../../export/index.ts";
import type { ProjectContext } from "../../project/index.ts";
import type { Issue } from "../../quality/index.ts";

const TEMPLATE_FILE_PATTERN = /\.template\.(tsx|ts|jsx|js)$/i;
const DEFAULT_TEMPLATE_NAME = "book";

type LoadedTemplateState = {
  templatePath: string;
  templateName: string;
  relativeTemplatePath: string;
  template: StegoTemplate;
  declaredTargets: readonly PresentationTarget[] | null;
  cleanup: () => void;
};

type CompiledTemplateState = LoadedTemplateState & {
  context: TemplateContext;
  renderPlan: RenderDocumentResult;
};

export type TemplateInspection = {
  templates: LoadedTemplateState[];
  issues: Issue[];
};

export type PlannedTemplateArtifact = {
  templatePath: string;
  templateName: string;
  declaredTargets: readonly PresentationTarget[] | null;
  markdownPath: string;
  renderPlanPath: string;
};

export type PlannedTemplateExport = PlannedTemplateArtifact & {
  outputPath: string;
  format: ExportTarget;
};

export type TemplatePlanner = {
  dispose: () => void;
  inspectDiscoveredTemplates: (options?: { allowMissingDefaultTemplate?: boolean }) => Promise<TemplateInspection>;
  buildDiscoveredTemplates: (inspection?: TemplateInspection) => Promise<PlannedTemplateArtifact[]>;
  exportDiscoveredTemplate: (
    format: string,
    explicitOutputPath?: string,
    inspection?: TemplateInspection
  ) => Promise<PlannedTemplateExport>;
};

export function createTemplatePlanner(project: ProjectContext): TemplatePlanner {
  // Discovery/build pipeline:
  // templates/*.template.tsx
  //   -> eager load and read declared targets
  //   -> cache loaded template modules per command
  //   -> compile each template once
  //   -> write per-template artifacts or resolve one export target
  const loadedTemplateCache = new Map<string, Promise<LoadedTemplateState>>();
  const compiledTemplateCache = new Map<string, Promise<CompiledTemplateState>>();
  const activeLoadedTemplates = new Map<string, LoadedTemplateState>();
  let contextCache: TemplateContext | null = null;

  function dispose(): void {
    for (const loaded of activeLoadedTemplates.values()) {
      loaded.cleanup();
    }
    activeLoadedTemplates.clear();
  }

  async function inspectDiscoveredTemplates(options: { allowMissingDefaultTemplate?: boolean } = {}): Promise<TemplateInspection> {
    const templatePaths = discoverTemplatePaths(project);
    if (templatePaths.length === 0) {
      if (options.allowMissingDefaultTemplate) {
        return {
          templates: [],
          issues: []
        };
      }

      return {
        templates: [],
        issues: [
          makeTemplateIssue(
            project,
            "error",
            "template",
            `Template file not found: ${path.join(project.templatesDir, "book.template.tsx")}. Create 'templates/book.template.tsx' or pass --template <path>.`
          )
        ]
      };
    }

    const duplicateNames = findDuplicateTemplateNames(templatePaths);
    const issues: Issue[] = duplicateNames.map(([templateName, paths]) =>
      makeTemplateIssue(
        project,
        "error",
        "template",
        `Duplicate template name '${templateName}' in ${paths.map((entry) => path.relative(project.root, entry)).join(", ")}. Rename one template so auto-discovery stays deterministic.`
      )
    );

    const loadedTemplates: LoadedTemplateState[] = [];
    for (const templatePath of templatePaths) {
      try {
        loadedTemplates.push(await loadDiscoveredTemplate(templatePath));
      } catch (error) {
        issues.push(makeTemplateIssue(project, "error", "template", formatTemplateLoadError(templatePath, error)));
      }
    }

    const hasDefaultTemplate = loadedTemplates.some((template) => template.templateName === DEFAULT_TEMPLATE_NAME);
    if (!hasDefaultTemplate) {
      issues.push(
        makeTemplateIssue(
          project,
          "error",
          "template",
          `Auto-discovered projects must keep 'templates/book.template.tsx' for the default markdown lane. Add that file or pass --template <path> for direct template commands.`
        )
      );
    }

    const usesAdvancedMode = loadedTemplates.some((template) =>
      template.templateName !== DEFAULT_TEMPLATE_NAME || template.declaredTargets !== null
    );
    if (usesAdvancedMode) {
      for (const template of loadedTemplates) {
        if (template.templateName !== DEFAULT_TEMPLATE_NAME && template.declaredTargets === null) {
          issues.push(
            makeTemplateIssue(
              project,
              "error",
              "template",
              `Auto-discovered template '${template.relativeTemplatePath}' must declare presentation targets with defineTemplate({ targets: [...] }, render).`,
              template.relativeTemplatePath
            )
          );
        }
      }
    }

    for (const target of ["docx", "pdf", "epub"] as const) {
      const matches = loadedTemplates.filter((template) =>
        supportsDiscoveredPresentationTarget(template, target, loadedTemplates.length)
      );
      if (matches.length > 1) {
        issues.push(
          makeTemplateIssue(
            project,
            "error",
            "template-export-ambiguity",
            `Multiple auto-discovered templates support '${target}': ${matches.map((entry) => entry.relativeTemplatePath).join(", ")}. Use --template <path> or narrow template targets so export stays unambiguous.`
          )
        );
      }
    }

    return {
      templates: loadedTemplates,
      issues
    };
  }

  async function buildDiscoveredTemplates(inspection?: TemplateInspection): Promise<PlannedTemplateArtifact[]> {
    const resolvedInspection = inspection || await inspectDiscoveredTemplates();
    const blockingIssues = resolvedInspection.issues.filter((issue) => issue.level === "error" && issue.category !== "template-export-ambiguity");
    if (blockingIssues.length > 0) {
      throw new CliError(
        "INVALID_CONFIGURATION",
        `Template discovery is invalid:\n${blockingIssues.map((issue) => `- ${issue.message}`).join("\n")}`
      );
    }

    const results: PlannedTemplateArtifact[] = [];
    const failures: string[] = [];

    for (const template of resolvedInspection.templates) {
      try {
        const compiled = await compileTemplate(template);
        results.push(writePlannedTemplateArtifacts(project, compiled));
      } catch (error) {
        failures.push(`- ${path.relative(project.root, template.templatePath)}: ${formatTemplateExecutionError(error)}`);
      }
    }

    if (failures.length > 0) {
      throw new CliError(
        "INVALID_CONFIGURATION",
        `Template build failed:\n${failures.join("\n")}`
      );
    }

    return results;
  }

  async function exportDiscoveredTemplate(
    format: string,
    explicitOutputPath?: string,
    inspection?: TemplateInspection
  ): Promise<PlannedTemplateExport> {
    const normalizedFormat = normalizeExportTarget(format);
    if (normalizedFormat === "md") {
      throw new CliError("INVALID_USAGE", "Discovered template export only resolves presentation targets. Use the default markdown export path instead.");
    }

    const resolvedInspection = inspection || await inspectDiscoveredTemplates();
    const blockingIssues = resolvedInspection.issues.filter((issue) => issue.level === "error");
    if (blockingIssues.length > 0) {
      throw new CliError(
        "INVALID_CONFIGURATION",
        `Template discovery is invalid:\n${blockingIssues.map((issue) => `- ${issue.message}`).join("\n")}`
      );
    }

    const matches = resolvedInspection.templates.filter((template) =>
      supportsDiscoveredPresentationTarget(template, normalizedFormat, resolvedInspection.templates.length)
    );
    if (matches.length === 0) {
      throw new CliError(
        "INVALID_CONFIGURATION",
        `No auto-discovered template supports '${normalizedFormat}'. Add defineTemplate({ targets: ["${normalizedFormat}"] }, render) or pass --template <path>.`
      );
    }
    if (matches.length > 1) {
      throw new CliError(
        "INVALID_CONFIGURATION",
        `Multiple auto-discovered templates support '${normalizedFormat}': ${matches.map((entry) => entry.relativeTemplatePath).join(", ")}. Use --template <path> until output profiles exist.`
      );
    }

    const compiled = await compileTemplate(matches[0]);
    const artifacts = writePlannedTemplateArtifacts(project, compiled);
    const metadataFilePath = Object.keys(compiled.renderPlan.metadata).length > 0
      ? writeTempMetadataFile(compiled.renderPlan.metadata)
      : null;

    try {
      const exported = await runExport({
        project,
        format: normalizedFormat,
        inputPath: artifacts.markdownPath,
        inputFormat: compiled.renderPlan.inputFormat,
        resourcePaths: [
          ...compiled.renderPlan.resourcePaths,
          project.contentDir,
          path.dirname(artifacts.markdownPath)
        ],
        requiredFilters: compiled.renderPlan.requiredFilters,
        explicitOutputPath,
        extraArgs: metadataFilePath ? ["--metadata-file", metadataFilePath] : [],
        postprocess: compiled.renderPlan.postprocess
      });

      return {
        ...artifacts,
        outputPath: exported.outputPath,
        format: normalizedFormat
      };
    } finally {
      if (metadataFilePath) {
        fs.rmSync(path.dirname(metadataFilePath), { recursive: true, force: true });
      }
    }
  }

  async function loadDiscoveredTemplate(templatePath: string): Promise<LoadedTemplateState> {
    const absolutePath = path.resolve(templatePath);
    const cached = loadedTemplateCache.get(absolutePath);
    if (cached) {
      return cached;
    }

    const loading = (async () => {
      const loaded = await loadTemplateFromFile(absolutePath);
      const state: LoadedTemplateState = {
        templatePath: absolutePath,
        templateName: inferTemplateName(absolutePath),
        relativeTemplatePath: path.relative(project.root, absolutePath),
        template: loaded.template,
        declaredTargets: loaded.template.targets,
        cleanup: loaded.cleanup
      };
      activeLoadedTemplates.set(absolutePath, state);
      return state;
    })();

    loadedTemplateCache.set(absolutePath, loading);
    return loading;
  }

  async function compileTemplate(template: LoadedTemplateState): Promise<CompiledTemplateState> {
    const cached = compiledTemplateCache.get(template.templatePath);
    if (cached) {
      return cached;
    }

    const compiling = (async () => {
      const context = contextCache || buildTemplateContext({
        projectRoot: project.root,
        contentDir: project.contentDir
      });
      contextCache = context;
      const document = evaluateTemplate(template.template, context);
      const renderPlan = renderDocument({
        document,
        projectRoot: project.root,
        context
      });

      return {
        ...template,
        context,
        renderPlan
      };
    })();

    compiledTemplateCache.set(template.templatePath, compiling);
    return compiling;
  }

  return {
    dispose,
    inspectDiscoveredTemplates,
    buildDiscoveredTemplates,
    exportDiscoveredTemplate
  };
}

function discoverTemplatePaths(project: ProjectContext): string[] {
  if (!fs.existsSync(project.templatesDir)) {
    return [];
  }

  return fs.readdirSync(project.templatesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && TEMPLATE_FILE_PATTERN.test(entry.name))
    .map((entry) => path.join(project.templatesDir, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

function inferTemplateName(templatePath: string): string {
  const match = path.basename(templatePath).match(/^(.*?)\.template\.[^.]+$/i);
  if (!match || !match[1]) {
    throw new Error(`Template filename must look like '*.template.tsx': ${templatePath}`);
  }
  return match[1];
}

function findDuplicateTemplateNames(templatePaths: string[]): Array<[string, string[]]> {
  const byName = new Map<string, string[]>();
  for (const templatePath of templatePaths) {
    const templateName = inferTemplateName(templatePath);
    byName.set(templateName, [...(byName.get(templateName) || []), templatePath]);
  }
  return [...byName.entries()].filter(([, paths]) => paths.length > 1);
}

function supportsDiscoveredPresentationTarget(
  template: LoadedTemplateState,
  target: PresentationTarget,
  discoveredCount: number
): boolean {
  if (template.declaredTargets?.includes(target)) {
    return true;
  }

  return discoveredCount === 1 && template.declaredTargets === null;
}

function writePlannedTemplateArtifacts(
  project: ProjectContext,
  compiled: CompiledTemplateState
): PlannedTemplateArtifact {
  fs.mkdirSync(project.distDir, { recursive: true });

  const artifactStem = compiled.templateName === DEFAULT_TEMPLATE_NAME
    ? project.id
    : `${project.id}.${compiled.templateName}`;
  const markdownPath = path.join(project.distDir, `${artifactStem}.md`);
  const renderPlanPath = path.join(project.distDir, `${artifactStem}.render-plan.json`);

  fs.writeFileSync(markdownPath, compiled.renderPlan.markdown, "utf8");
  fs.writeFileSync(renderPlanPath, `${JSON.stringify(compiled.renderPlan, null, 2)}\n`, "utf8");

  return {
    templatePath: compiled.templatePath,
    templateName: compiled.templateName,
    declaredTargets: compiled.declaredTargets,
    markdownPath,
    renderPlanPath
  };
}

function normalizeExportTarget(value: string): ExportTarget {
  const normalized = value.trim().toLowerCase();
  if (!isExportTarget(normalized)) {
    throw new CliError("INVALID_USAGE", `Unsupported export format '${value}'. Use md, docx, pdf, or epub.`);
  }
  return normalized;
}

function writeTempMetadataFile(metadata: Record<string, unknown>): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stego-template-export-"));
  const metadataFilePath = path.join(tempDir, "metadata.yaml");
  fs.writeFileSync(metadataFilePath, yaml.dump(metadata), "utf8");
  return metadataFilePath;
}

function formatTemplateLoadError(templatePath: string, error: unknown): string {
  const relativeTemplatePath = path.relative(process.cwd(), templatePath);
  if (error instanceof TemplateContractError) {
    return `${relativeTemplatePath}: ${error.message}`;
  }

  return `${relativeTemplatePath}: ${error instanceof Error ? error.message : String(error)}`;
}

function formatTemplateExecutionError(error: unknown): string {
  if (error instanceof TemplateContractError) {
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

function makeTemplateIssue(
  project: ProjectContext,
  level: Issue["level"],
  category: Issue["category"],
  message: string,
  file?: string | null
): Issue {
  const normalizedFile = file
    ? path.relative(project.workspace.repoRoot, path.resolve(project.root, file))
    : path.relative(project.workspace.repoRoot, project.templatesDir);
  return {
    level,
    category,
    message,
    file: normalizedFile,
    line: null
  };
}

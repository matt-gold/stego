import type { PageRegionSpec, StegoDocumentNode, StegoNode } from "../../ir/index.ts";
import {
  TARGET_CAPABILITIES,
  isPresentationTarget,
  type PresentationTarget,
  type TemplateCapability
} from "@stego-labs/shared/domain/templates";
import type {
  BranchMetadata,
  LeafMetadata,
  ProjectMetadata,
  StegoTemplate,
  TemplateContext
} from "../public/types.ts";

export type TemplateContractErrorReason =
  | "invalid-module"
  | "invalid-targets"
  | "invalid-render-result"
  | "unsupported-target-capability";

export class TemplateContractError extends Error {
  public readonly reason: TemplateContractErrorReason;

  public readonly details?: Record<string, unknown>;

  public constructor(reason: TemplateContractErrorReason, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "TemplateContractError";
    this.reason = reason;
    this.details = details;
  }
}

export function assertTemplateModule(value: unknown): StegoTemplate {
  if (
    typeof value === "object"
    && value !== null
    && (value as { kind?: unknown }).kind === "stego-template"
    && typeof (value as { render?: unknown }).render === "function"
  ) {
    const targets = (value as { targets?: unknown }).targets;
    if (targets !== null && targets !== undefined) {
      if (!Array.isArray(targets) || targets.length === 0) {
        throw new TemplateContractError(
          "invalid-targets",
          "Target-aware templates must declare one or more presentation targets.",
          { targets }
        );
      }
      const invalid = targets.filter((entry) => typeof entry !== "string" || !isPresentationTarget(entry));
      if (invalid.length > 0) {
        throw new TemplateContractError(
          "invalid-targets",
          "Target-aware templates may only declare docx, pdf, epub, or latex.",
          { targets }
        );
      }
      if (new Set(targets).size !== targets.length) {
        throw new TemplateContractError(
          "invalid-targets",
          "Target-aware templates may not declare duplicate presentation targets.",
          { targets }
        );
      }
    }

    return value as StegoTemplate;
  }

  throw new TemplateContractError("invalid-module", "Template must default export defineTemplate(...).");
}

export function evaluateTemplate(template: StegoTemplate, context: TemplateContext): StegoDocumentNode {
  const document = template.render(context);
  if (!document || document.kind !== "document") {
    throw new TemplateContractError("invalid-render-result", "Template render() must return <Stego.Document>.");
  }
  validateDocumentTargets(template.targets, document);
  return document;
}

export function evaluateTypedTemplate<
  TLeafMetadata extends LeafMetadata = LeafMetadata,
  TBranchMetadata extends BranchMetadata = BranchMetadata,
  TProjectMetadata extends ProjectMetadata = ProjectMetadata
>(
  template: StegoTemplate<TLeafMetadata, TBranchMetadata, TProjectMetadata>,
  context: TemplateContext<TLeafMetadata, TBranchMetadata, TProjectMetadata>
): StegoDocumentNode {
  const document = template.render(context);
  if (!document || document.kind !== "document") {
    throw new TemplateContractError("invalid-render-result", "Template render() must return <Stego.Document>.");
  }
  validateDocumentTargets(template.targets, document);
  return document;
}

function validateDocumentTargets(
  declaredTargets: readonly PresentationTarget[] | null,
  document: StegoDocumentNode
): void {
  if (!declaredTargets) {
    return;
  }
  if (declaredTargets.length === 0) {
    throw new TemplateContractError(
      "invalid-targets",
      "Target-aware templates must declare one or more presentation targets.",
      { targets: declaredTargets }
    );
  }

  const capabilities = resolveSupportedCapabilities(declaredTargets);
  visitNode(document, declaredTargets, capabilities);
}

function resolveSupportedCapabilities(targets: readonly PresentationTarget[]): Record<TemplateCapability, boolean> {
  return {
    pageLayout: targets.every((target) => TARGET_CAPABILITIES[target].pageLayout),
    pageTemplate: targets.every((target) => TARGET_CAPABILITIES[target].pageTemplate),
    pageNumber: targets.every((target) => TARGET_CAPABILITIES[target].pageNumber),
    keepTogether: targets.every((target) => TARGET_CAPABILITIES[target].keepTogether),
    pageBreak: targets.every((target) => TARGET_CAPABILITIES[target].pageBreak),
    spacing: targets.every((target) => TARGET_CAPABILITIES[target].spacing),
    inset: targets.every((target) => TARGET_CAPABILITIES[target].inset),
    indent: targets.every((target) => TARGET_CAPABILITIES[target].indent),
    align: targets.every((target) => TARGET_CAPABILITIES[target].align),
    typography: targets.every((target) => TARGET_CAPABILITIES[target].typography),
    imageAlign: targets.every((target) => TARGET_CAPABILITIES[target].imageAlign),
    imageLayout: targets.every((target) => TARGET_CAPABILITIES[target].imageLayout)
  };
}

function visitNode(
  node: StegoNode,
  targets: readonly PresentationTarget[],
  capabilities: Record<TemplateCapability, boolean>
): void {
  switch (node.kind) {
    case "document":
      if (node.page) {
        assertCapability("pageLayout", "Document", targets, capabilities);
      }
      if (node.parSpaceBefore !== undefined || node.parSpaceAfter !== undefined) {
        assertCapability("spacing", "Document", targets, capabilities);
      }
      validateTypographyCapabilities("Document", node, targets, capabilities);
      for (const child of node.children) {
        visitNode(child, targets, capabilities);
      }
      return;
    case "fragment":
      for (const child of node.children) {
        visitNode(child, targets, capabilities);
      }
      return;
    case "keepTogether":
      assertCapability("keepTogether", "KeepTogether", targets, capabilities);
      for (const child of node.children) {
        visitNode(child, targets, capabilities);
      }
      return;
    case "section":
      validateSharedBlockCapabilities("Section", node, targets, capabilities);
      if (node.parSpaceBefore !== undefined || node.parSpaceAfter !== undefined) {
        assertCapability("spacing", "Section", targets, capabilities);
      }
      validateTypographyCapabilities("Section", node, targets, capabilities);
      for (const child of node.children) {
        visitNode(child, targets, capabilities);
      }
      return;
    case "heading":
      validateSharedBlockCapabilities("Heading", node, targets, capabilities);
      validateTypographyCapabilities("Heading", node, targets, capabilities);
      return;
    case "paragraph":
      validateSharedBlockCapabilities("Paragraph", node, targets, capabilities);
      validateTypographyCapabilities("Paragraph", node, targets, capabilities);
      return;
    case "markdownParagraph":
      if (node.spaceBefore !== undefined || node.spaceAfter !== undefined) {
        assertCapability("spacing", "MarkdownParagraph", targets, capabilities);
      }
      return;
    case "markdownHeading":
    case "markdownBlock":
      return;
    case "image":
      if (node.layout !== undefined) {
        assertCapability("imageLayout", "Image", targets, capabilities);
      }
      if (node.align !== undefined) {
        assertCapability("imageAlign", "Image", targets, capabilities);
      }
      return;
    case "pageBreak":
      assertCapability("pageBreak", "PageBreak", targets, capabilities);
      return;
    case "pageTemplate":
      assertCapability("pageTemplate", "PageTemplate", targets, capabilities);
      visitRegion(node.header, targets, capabilities);
      visitRegion(node.footer, targets, capabilities);
      return;
    case "pageNumber":
      assertCapability("pageNumber", "PageNumber", targets, capabilities);
      return;
    case "markdown":
    case "plainText":
    case "link":
    case "text":
      return;
    default:
      return assertNever(node);
  }
}

function visitRegion(
  region: PageRegionSpec | undefined,
  targets: readonly PresentationTarget[],
  capabilities: Record<TemplateCapability, boolean>
): void {
  if (!region) {
    return;
  }

  for (const child of [region.left, region.center, region.right]) {
    if (child) {
      visitNode(child, targets, capabilities);
    }
  }
}

function validateSharedBlockCapabilities(
  componentName: "Section" | "Heading" | "Paragraph",
  node: {
    spaceBefore?: unknown;
    spaceAfter?: unknown;
    insetLeft?: unknown;
    insetRight?: unknown;
    firstLineIndent?: unknown;
    align?: unknown;
  },
  targets: readonly PresentationTarget[],
  capabilities: Record<TemplateCapability, boolean>
): void {
  if (node.spaceBefore !== undefined || node.spaceAfter !== undefined) {
    assertCapability("spacing", componentName, targets, capabilities);
  }
  if (node.insetLeft !== undefined || node.insetRight !== undefined) {
    assertCapability("inset", componentName, targets, capabilities);
  }
  if (node.firstLineIndent !== undefined) {
    assertCapability("indent", componentName, targets, capabilities);
  }
  if (node.align !== undefined) {
    assertCapability("align", componentName, targets, capabilities);
  }
}

function validateTypographyCapabilities(
  componentName: "Document" | "Section" | "Heading" | "Paragraph",
  node: {
    fontFamily?: unknown;
    fontSize?: unknown;
    lineSpacing?: unknown;
  },
  targets: readonly PresentationTarget[],
  capabilities: Record<TemplateCapability, boolean>
): void {
  if (node.fontFamily !== undefined || node.fontSize !== undefined || node.lineSpacing !== undefined) {
    assertCapability("typography", componentName, targets, capabilities);
  }
}

function assertCapability(
  capability: TemplateCapability,
  componentName: string,
  targets: readonly PresentationTarget[],
  capabilities: Record<TemplateCapability, boolean>
): void {
  if (capabilities[capability]) {
    return;
  }

  throw new TemplateContractError(
    "unsupported-target-capability",
    `<Stego.${componentName}> uses '${capability}' but the declared targets (${targets.join(", ")}) do not all support it.`,
    {
      capability,
      componentName,
      targets: [...targets]
    }
  );
}

function assertNever(value: never): never {
  throw new Error(`Unhandled Stego node kind: ${(value as { kind?: string }).kind ?? "unknown"}`);
}

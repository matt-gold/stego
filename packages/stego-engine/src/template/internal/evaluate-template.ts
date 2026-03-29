import type {
  BodyStyle,
  HeadingStyle,
  HeadingStyleMap,
  PageRegionSpec,
  StegoDocumentNode,
  StegoNode,
} from "../../ir/index.ts";
import {
  TARGET_CAPABILITIES,
  isPresentationTarget,
  type PresentationTarget,
  type TemplateCapability
} from "@stego-labs/shared/domain/templates";
import {
  BODY_STYLE_CAPABILITIES,
  HEADING_LEVELS,
  HEADING_STYLE_CAPABILITIES,
  normalizeHexColor,
  SPAN_STYLE_CAPABILITIES,
} from "../../style/index.ts";
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
  | "invalid-style-value"
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
  visitNode(document, declaredTargets, capabilities, false);
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
    fontFamily: targets.every((target) => TARGET_CAPABILITIES[target].fontFamily),
    fontSize: targets.every((target) => TARGET_CAPABILITIES[target].fontSize),
    lineSpacing: targets.every((target) => TARGET_CAPABILITIES[target].lineSpacing),
    fontWeight: targets.every((target) => TARGET_CAPABILITIES[target].fontWeight),
    italic: targets.every((target) => TARGET_CAPABILITIES[target].italic),
    underline: targets.every((target) => TARGET_CAPABILITIES[target].underline),
    smallCaps: targets.every((target) => TARGET_CAPABILITIES[target].smallCaps),
    textColor: targets.every((target) => TARGET_CAPABILITIES[target].textColor),
    imageAlign: targets.every((target) => TARGET_CAPABILITIES[target].imageAlign),
    imageLayout: targets.every((target) => TARGET_CAPABILITIES[target].imageLayout)
  };
}

function visitNode(
  node: StegoNode,
  targets: readonly PresentationTarget[],
  capabilities: Record<TemplateCapability, boolean>,
  inPageRegion: boolean,
  inPageTemplate: boolean = false,
  parentKind: StegoNode["kind"] | null = null,
): void {
  switch (node.kind) {
    case "document":
      if (node.page) {
        assertCapability("pageLayout", "Document", targets, capabilities);
      }
      validateBodyStyle("Document.bodyStyle", node.bodyStyle, targets, capabilities);
      validateHeadingStyle("Document.headingStyle", node.headingStyle, targets, capabilities);
      validateHeadingStyleMap("Document.headingStyles", node.headingStyles, targets, capabilities);
      for (const child of node.children) {
        visitNode(child, targets, capabilities, false, false, "document");
      }
      return;
    case "fragment":
      for (const child of node.children) {
        visitNode(child, targets, capabilities, inPageRegion, inPageTemplate, "fragment");
      }
      return;
    case "keepTogether":
      assertCapability("keepTogether", "KeepTogether", targets, capabilities);
      for (const child of node.children) {
        visitNode(child, targets, capabilities, false, inPageTemplate, "keepTogether");
      }
      return;
    case "section":
      validateBodyStyle("Section.bodyStyle", node.bodyStyle, targets, capabilities);
      validateHeadingStyle("Section.headingStyle", node.headingStyle, targets, capabilities);
      validateHeadingStyleMap("Section.headingStyles", node.headingStyles, targets, capabilities);
      for (const child of node.children) {
        visitNode(child, targets, capabilities, false, inPageTemplate, "section");
      }
      return;
    case "heading":
      validateFlatBodyStyle("Heading", node, targets, capabilities);
      validateFlatHeadingStyle("Heading", node, targets, capabilities);
      for (const child of node.children) {
        visitNode(child, targets, capabilities, false, inPageTemplate, "heading");
      }
      return;
    case "paragraph":
      validateFlatBodyStyle("Paragraph", node, targets, capabilities);
      for (const child of node.children) {
        visitNode(child, targets, capabilities, false, inPageTemplate, "paragraph");
      }
      return;
    case "span":
      validateStyleFields("Span", node, SPAN_STYLE_CAPABILITIES, targets, capabilities);
      for (const child of node.children) {
        visitNode(child, targets, capabilities, inPageRegion, inPageTemplate, "span");
      }
      return;
    case "spacer":
      return;
    case "markdownParagraph":
      validateFlatBodyStyle("MarkdownParagraph", node, targets, capabilities);
      return;
    case "markdownHeading":
      validateFlatBodyStyle("MarkdownHeading", node, targets, capabilities);
      validateFlatHeadingStyle("MarkdownHeading", node, targets, capabilities);
      return;
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
      if (inPageTemplate) {
        throw new TemplateContractError(
          "invalid-render-result",
          "<Stego.PageTemplate /> may not be nested inside another <Stego.PageTemplate /> in V1.",
        );
      }
      if (parentKind !== "document" && parentKind !== "fragment") {
        throw new TemplateContractError(
          "invalid-render-result",
          "<Stego.PageTemplate /> may only appear directly under <Stego.Document /> or a top-level fragment in V1.",
        );
      }
      visitRegion(node.header, targets, capabilities);
      visitRegion(node.footer, targets, capabilities);
      for (const child of node.children) {
        visitNode(child, targets, capabilities, false, true, "pageTemplate");
      }
      return;
    case "pageNumber":
      if (!inPageRegion) {
        throw new TemplateContractError(
          "invalid-render-result",
          "<Stego.PageNumber /> may only appear inside <Stego.PageTemplate /> in V1.",
        );
      }
      assertCapability("pageNumber", "PageNumber", targets, capabilities);
      return;
    case "markdown":
    case "plainText":
    case "text":
      return;
    case "link":
      if (inPageRegion) {
        throw new TemplateContractError(
          "invalid-render-result",
          "<Stego.Link /> is not supported inside <Stego.PageTemplate /> regions in V1.",
        );
      }
      for (const child of node.children) {
        visitNode(child, targets, capabilities, false);
      }
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

  for (const children of [region.left, region.center, region.right]) {
    if (children) {
      for (const child of children) {
        visitNode(child, targets, capabilities, true);
      }
    }
  }
}

function validateFlatBodyStyle(
  componentName: "Heading" | "Paragraph" | "MarkdownParagraph" | "MarkdownHeading",
  node: Partial<BodyStyle>,
  targets: readonly PresentationTarget[],
  capabilities: Record<TemplateCapability, boolean>
): void {
  validateStyleFields(componentName, node, BODY_STYLE_CAPABILITIES, targets, capabilities);
}

function validateFlatHeadingStyle(
  componentName: "Heading" | "MarkdownHeading",
  node: Partial<HeadingStyle>,
  targets: readonly PresentationTarget[],
  capabilities: Record<TemplateCapability, boolean>
): void {
  validateStyleFields(componentName, node, HEADING_STYLE_CAPABILITIES, targets, capabilities);
}

function validateBodyStyle(
  componentName: "Document.bodyStyle" | "Section.bodyStyle",
  style: BodyStyle | undefined,
  targets: readonly PresentationTarget[],
  capabilities: Record<TemplateCapability, boolean>
): void {
  validateStyleFields(componentName, style, BODY_STYLE_CAPABILITIES, targets, capabilities);
}

function validateHeadingStyle(
  componentName: "Document.headingStyle" | "Section.headingStyle",
  style: HeadingStyle | undefined,
  targets: readonly PresentationTarget[],
  capabilities: Record<TemplateCapability, boolean>
): void {
  validateStyleFields(componentName, style, HEADING_STYLE_CAPABILITIES, targets, capabilities);
}

function validateHeadingStyleMap(
  componentName: "Document.headingStyles" | "Section.headingStyles",
  styles: HeadingStyleMap | undefined,
  targets: readonly PresentationTarget[],
  capabilities: Record<TemplateCapability, boolean>
): void {
  if (!styles) {
    return;
  }

  const allowed = new Set(HEADING_LEVELS.map(String));
  for (const [rawLevel, style] of Object.entries(styles)) {
    if (!allowed.has(rawLevel)) {
      throw new TemplateContractError(
        "invalid-style-value",
        `${componentName} may only define keys 1 through 6.`,
        { componentName, level: rawLevel, targets: [...targets] }
      );
    }
    validateStyleFields(
      `${componentName}.${rawLevel}` as string,
      style,
      HEADING_STYLE_CAPABILITIES,
      targets,
      capabilities
    );
  }
}

function validateStyleFields<TStyle extends object>(
  componentName: string,
  style: TStyle | undefined,
  fieldCapabilities: Partial<Record<keyof TStyle, TemplateCapability>>,
  targets: readonly PresentationTarget[],
  capabilities: Record<TemplateCapability, boolean>
): void {
  if (!style) {
    return;
  }

  for (const [key, value] of Object.entries(style) as Array<[keyof TStyle & string, unknown]>) {
    if (value === undefined) {
      continue;
    }

    if (key === "color" && normalizeHexColor(typeof value === "string" ? value : undefined) === undefined) {
      throw new TemplateContractError(
        "invalid-style-value",
        `${componentName}.${key} must be a hex color like '#333' or '#333333'.`,
        { componentName, key, value }
      );
    }

    const capability = fieldCapabilities[key as keyof TStyle];
    if (!capability) {
      continue;
    }
    assertCapability(capability, componentName, targets, capabilities);
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

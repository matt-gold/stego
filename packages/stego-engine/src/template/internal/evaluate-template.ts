import type { StegoDocumentNode } from "../../ir/index.ts";
import type { StegoTemplate, TemplateContext } from "../public/types.ts";

export function assertTemplateModule(value: unknown): StegoTemplate {
  if (
    typeof value === "object"
    && value !== null
    && (value as { kind?: unknown }).kind === "stego-template"
    && typeof (value as { render?: unknown }).render === "function"
  ) {
    return value as StegoTemplate;
  }

  throw new Error("Template must default export defineTemplate(...).");
}

export function evaluateTemplate(template: StegoTemplate, context: TemplateContext): StegoDocumentNode {
  const document = template.render(context);
  if (!document || document.kind !== "document") {
    throw new Error("Template render() must return <Stego.Document>.");
  }
  return document;
}

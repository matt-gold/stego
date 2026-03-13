import type { StegoDocumentNode } from "../../ir/index.ts";
import type { StegoTemplate, TemplateContext } from "./types.ts";

export function defineTemplate(
  render: (context: TemplateContext) => StegoDocumentNode
): StegoTemplate {
  return {
    kind: "stego-template",
    render
  };
}

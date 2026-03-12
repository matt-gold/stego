import type { StegoDocumentNode, StegoNode } from "../../ir/index.ts";
import type { StegoTemplate, TemplateContext } from "./types.ts";

export function defineTemplate(
  render: (context: TemplateContext) => StegoDocumentNode | StegoNode
): StegoTemplate {
  return {
    kind: "stego-template",
    render
  };
}

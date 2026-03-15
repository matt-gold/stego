import type { DocxBlockLayoutSpec } from "@stego-labs/shared/domain/layout";
import type { StegoDocumentNode } from "../../ir/index.ts";
import type { TemplateContext } from "../../template/index.ts";

export type RenderDocumentInput = {
  document: StegoDocumentNode;
  projectRoot: string;
  context: TemplateContext;
};

export type RenderDocumentResult = {
  backend: "pandoc";
  inputFormat: string;
  markdown: string;
  metadata: Record<string, unknown>;
  resourcePaths: string[];
  requiredFilters: string[];
  postprocess: {
    docx: {
      blockLayouts: DocxBlockLayoutSpec[];
    };
  };
};

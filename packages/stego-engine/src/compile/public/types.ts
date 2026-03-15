import type { StegoDocumentNode } from "../../ir/index.ts";
import type { TemplateContext } from "../../template/index.ts";
import type { PresentationTarget } from "@stego-labs/shared/domain/templates";

export type CompileProjectInput = {
  projectRoot: string;
  contentDir?: string;
  templatePath?: string;
};

export type CompileProjectResult = {
  projectRoot: string;
  templatePath: string;
  declaredTargets: readonly PresentationTarget[] | null;
  document: StegoDocumentNode;
  context: TemplateContext;
};

export type BuildTemplateContextInput = {
  projectRoot: string;
  contentDir?: string;
};

export { defineTemplate } from "./public/defineTemplate.ts";
export { Stego } from "./public/components.ts";
export { evaluateTemplate, evaluateTypedTemplate, TemplateContractError } from "./internal/evaluate-template.ts";
export { loadTemplateFromFile } from "./internal/template-loader.ts";
export type {
  ProjectMetadata,
  LeafMetadata,
  BranchMetadata,
  ProjectRecord,
  LeafRecord,
  BranchRecord,
  TemplateContext,
  StegoTemplate,
  TemplateDefinitionOptions
} from "./public/types.ts";
export type { StegoApi } from "./public/components.ts";
export type { ExportTarget, PresentationTarget } from "@stego-labs/shared/domain/templates";

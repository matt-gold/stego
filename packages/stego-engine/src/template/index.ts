export { defineTemplate } from "./public/defineTemplate.ts";
export { Stego } from "./public/components.ts";
export { evaluateTemplate, evaluateTypedTemplate } from "./internal/evaluate-template.ts";
export { loadTemplateFromFile } from "./internal/template-loader.ts";
export type {
  ProjectMetadata,
  LeafMetadata,
  BranchMetadata,
  ProjectRecord,
  LeafRecord,
  BranchRecord,
  TemplateContext,
  StegoTemplate
} from "./public/types.ts";

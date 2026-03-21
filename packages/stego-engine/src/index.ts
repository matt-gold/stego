export * from "./ir/index.ts";
export type { Group, GroupSelector, SplitGroup } from "./collections/index.ts";
export { defineTemplate, Stego } from "./template/index.ts";
export { TemplateContractError } from "./template/index.ts";
export { evaluateTemplate, loadTemplateFromFile } from "./template/index.ts";
export type {
  ProjectMetadata,
  LeafMetadata,
  BranchMetadata,
  ProjectRecord,
  LeafRecord,
  BranchRecord,
  ContentTree,
  TemplateContext,
  StegoTemplate,
  TemplateDefinitionOptions,
  StegoApi
} from "./template/index.ts";
export { compileProject, buildTemplateContext } from "./compile/index.ts";
export type { CompileProjectInput, CompileProjectResult, BuildTemplateContextInput } from "./compile/index.ts";
export { renderDocument } from "./render/index.ts";
export type { RenderDocumentInput, RenderDocumentResult } from "./render/index.ts";
export type { ExportTarget, PresentationTarget } from "@stego-labs/shared/domain/templates";

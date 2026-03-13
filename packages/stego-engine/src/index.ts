export * from "./ir/index.ts";
export { createCollection } from "./collections/index.ts";
export type { Collection, Group, GroupSelector, SortSelector, SplitGroup } from "./collections/index.ts";
export { defineTemplate, Stego } from "./template/index.ts";
export type {
  ManuscriptRecord,
  SpineEntryRecord,
  SpineCategoryRecord,
  TemplateContext,
  StegoTemplate
} from "./template/index.ts";
export { compileProject, buildTemplateContext } from "./compile/index.ts";
export type { CompileProjectInput, CompileProjectResult, BuildTemplateContextInput } from "./compile/index.ts";
export { renderDocument } from "./render/index.ts";
export type { RenderDocumentInput, RenderDocumentResult } from "./render/index.ts";
